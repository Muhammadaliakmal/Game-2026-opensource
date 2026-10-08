import { PARTY_MAX, isPlayablePartyGame, partyGame, rankScores } from "./party-games";

/**
 * A party: a few people in one room, playing one game at a time together.
 *
 * Pure logic, no network. There is no party server: the HOST's browser holds
 * the one `Party`, and everyone else holds the snapshot it last sent
 * (`net/party-session.ts`). This is who is here, who decides, and who won.
 *
 * ── There is a host, unlike the race ─────────────────────────────────────
 *
 * The race has no host because there is one thing to decide (when to go) and
 * anyone may decide it. A party decides *what to play*, and eight people
 * picking games at once is no game at all. The host is whoever opened it, and
 * when they leave it passes to the longest-standing member, so a party never
 * strands its guests without anyone able to press Start.
 *
 * ── A round is a seed ────────────────────────────────────────────────────
 *
 * Score cabinets are a function of their seed, so a round is one seed handed
 * to everyone. The party counts a member's run as finished when they say so;
 * it is not anti-cheat, and the payout does not read it — a run pays what it
 * would have paid alone, through the same route.
 */

export type PartyPhase = "lobby" | "playing" | "results";

export interface Member {
  id: string;
  name: string;
  /** Monotonic join order, so host handover is deterministic. */
  order: number;
  /** In the current round. False for anyone who arrived mid-round. */
  playing: boolean;
  score: number;
  done: boolean;
}

/** What the host sends everyone, and what a new host is rebuilt from. */
export interface PartySnapshot {
  hostId: string;
  /**
   * When the party began, on its first host's clock. Two hosts on one code
   * keep the older party (`net/party-session.ts`) — a fact neither side's
   * connections can change, which a head count is not.
   */
  born: number;
  phase: PartyPhase;
  game: string;
  seed: number;
  round: number;
  joins: number;
  members: Member[];
  /**
   * For a table game, the member in each seat this round, in seat order.
   * Empty for a score game, where everyone plays their own copy.
   */
  seats: string[];
  /**
   * Where the host last sent everyone — the bike race or a parkour course
   * (`go`). `n` counts sends, so the same course twice still moves people.
   */
  go: { href: string; n: number };
}

/** The pages a host may send a party to: a race, or a course to play together. */
const GO_HREF = /^\/(race\/[A-Z0-9]{6}(\?[A-Za-z0-9=&_-]*)?|play\/[a-z0-9-]+\?together=[A-Z0-9]{6})$/;

export interface Standing {
  id: string;
  name: string;
  score: number;
  place: number;
}

/** A round nobody finishes still ends: a phone left on a table. */
export const ROUND_LIMIT_MS = 15 * 60_000;

export class Party {
  members = new Map<string, Member>();
  hostId = "";
  phase: PartyPhase = "lobby";
  game = "";
  seed = 0;
  round = 0;
  startedAt = 0;
  born = 0;
  seats: string[] = [];
  goTo = { href: "", n: 0 };
  private joins = 0;

  constructor(private readonly nextSeed: () => number) {}

  snapshot(): PartySnapshot {
    return {
      hostId: this.hostId,
      born: this.born,
      phase: this.phase,
      game: this.game,
      seed: this.seed,
      round: this.round,
      joins: this.joins,
      members: [...this.members.values()].map((m) => ({ ...m })),
      seats: [...this.seats],
      go: { ...this.goTo },
    };
  }

  /**
   * Rebuild the party in a new host's browser from the last snapshot it had.
   * The round carries on: its clock restarts from `now`, which only means a
   * forgotten round times out a little later than it would have.
   */
  static restore(snap: PartySnapshot, nextSeed: () => number, now: number): Party {
    const p = new Party(nextSeed);
    p.hostId = snap.hostId;
    p.born = snap.born;
    p.phase = snap.phase;
    p.game = snap.game;
    p.seed = snap.seed;
    p.round = snap.round;
    p.joins = snap.joins;
    p.seats = [...(snap.seats ?? [])];
    p.goTo = { ...(snap.go ?? { href: "", n: 0 }) };
    p.startedAt = now;
    for (const m of snap.members) p.members.set(m.id, { ...m });
    return p;
  }

  /** Hand the party to someone already in it, as the session's election decided. */
  setHost(id: string): boolean {
    if (!this.members.has(id)) return false;
    this.hostId = id;
    return true;
  }

  get full() {
    return this.members.size >= PARTY_MAX;
  }

  join(id: string, name: string): Member | null {
    if (this.members.has(id)) return this.members.get(id)!;
    if (this.full) return null;
    const m: Member = {
      id,
      name: name || "Player",
      order: this.joins++,
      playing: false,
      score: 0,
      done: false,
    };
    this.members.set(id, m);
    if (!this.hostId) this.hostId = id;
    return m;
  }

  /** Returns true if leaving ended the round (everyone left is done). */
  leave(id: string): boolean {
    if (!this.members.delete(id)) return false;
    if (this.hostId === id) {
      let next: Member | null = null;
      for (const m of this.members.values()) if (!next || m.order < next.order) next = m;
      this.hostId = next?.id ?? "";
    }
    return this.maybeEnd();
  }

  isHost(id: string) {
    return id === this.hostId;
  }

  /** Host only, and not mid-round: changing the game under people playing it is not a pick. */
  pick(by: string, game: string): boolean {
    if (!this.isHost(by) || this.phase === "playing") return false;
    if (!isPlayablePartyGame(game)) return false;
    this.game = game;
    if (this.phase === "results") this.phase = "lobby";
    return true;
  }

  /** Host only. Starts (or restarts, as a rematch) a round of the picked game. */
  start(by: string, now: number): boolean {
    if (!this.isHost(by) || this.phase === "playing" || !this.game) return false;
    this.round++;
    this.seed = this.nextSeed() >>> 0;
    this.phase = "playing";
    this.startedAt = now;
    // A table game seats the first members to arrive; everyone else watches.
    const table = partyGame(this.game)?.seats;
    const byOrder = [...this.members.values()].sort((a, b) => a.order - b.order);
    this.seats = table ? byOrder.slice(0, table).map((m) => m.id) : [];
    for (const m of this.members.values()) {
      m.playing = !table || this.seats.includes(m.id);
      m.score = 0;
      m.done = false;
    }
    return true;
  }

  /** A running score. Ignored outside a round, from a spectator, or after done. */
  score(id: string, n: number): boolean {
    const m = this.members.get(id);
    if (!m || this.phase !== "playing" || !m.playing || m.done) return false;
    if (!Number.isFinite(n)) return false;
    m.score = Math.max(0, Math.floor(n));
    return true;
  }

  /** A member's run ended. Returns true if that ended the round. */
  finish(id: string, n: number): boolean {
    const m = this.members.get(id);
    if (!m || this.phase !== "playing" || !m.playing || m.done) return false;
    if (Number.isFinite(n)) m.score = Math.max(0, Math.floor(n));
    m.done = true;
    return this.maybeEnd();
  }

  /** The room's clock. Returns true if the round timed out. */
  tick(now: number): boolean {
    if (this.phase !== "playing" || now - this.startedAt < ROUND_LIMIT_MS) return false;
    for (const m of this.members.values()) if (m.playing) m.done = true;
    return this.maybeEnd();
  }

  /** Host only: send everyone to the race or a course. Only this site's own game pages. */
  go(by: string, href: string): boolean {
    if (!this.isHost(by) || !GO_HREF.test(href)) return false;
    this.goTo = { href, n: this.goTo.n + 1 };
    return true;
  }

  /** Host only: everyone back to the game picker. */
  toLobby(by: string): boolean {
    if (!this.isHost(by) || this.phase === "lobby") return false;
    this.phase = "lobby";
    for (const m of this.members.values()) {
      m.playing = false;
      m.done = false;
    }
    return true;
  }

  /** The round's results, best first, ties sharing a place (`rankScores`). */
  standings(): Standing[] {
    return rankScores([...this.members.values()].filter((m) => m.playing)).map(({ row, place }) => ({
      id: row.id,
      name: row.name,
      score: row.score,
      place,
    }));
  }

  private maybeEnd(): boolean {
    if (this.phase !== "playing") return false;
    const playing = [...this.members.values()].filter((m) => m.playing);
    if (playing.length > 0 && playing.some((m) => !m.done)) return false;
    this.phase = "results";
    return true;
  }
}
