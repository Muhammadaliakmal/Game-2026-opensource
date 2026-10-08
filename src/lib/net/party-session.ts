import { Party, type PartySnapshot } from "../party";
import { guestName } from "../party-games";

/**
 * One browser's side of a party, with no server anywhere.
 *
 * Every member is connected to every other directly (WebRTC, through
 * `net/party.ts`). One of them is the HOST: its browser holds the real
 * `Party`, applies every action, and sends everyone a snapshot. Everyone else
 * renders the last snapshot they got and sends the host their own score.
 *
 * Pure: the network is a `send` function and the clock is a parameter, so
 * `party-session.test.ts` runs a whole party — joins, a round, the host
 * walking out — over an in-memory bus.
 *
 * ── The three ways a host comes to be ────────────────────────────────────
 *
 * 1. **The creator.** Whoever pressed "Start a party" hosts from the first
 *    frame, alone.
 * 2. **Succession.** The host's browser goes away. Every guest holds the same
 *    last snapshot and runs the same rule — the longest-standing member still
 *    connected — so they agree on the heir without a word being exchanged,
 *    and only the heir acts: it rebuilds the `Party` from that snapshot.
 * 3. **A collision.** Two browsers host one code (a reload, a link opened on
 *    two tabs before either saw the other). Each sees the other's snapshot;
 *    the OLDER party wins, ties to the smaller peer id, and the loser joins
 *    the winner as a guest. Both sides compare the same two numbers, so both
 *    reach the same answer. Not the bigger party: in a mesh each host has
 *    already counted every peer it can see, so the two counts converge.
 *    A reloaded host is the common case, and age sends it back into the
 *    party its heir has been running.
 */

export type PartyMessage =
  | { t: "state"; snap: PartySnapshot }
  | { t: "act"; a: "score" | "done"; n: number };

export interface SessionOptions {
  selfId: string;
  code: string;
  creator: boolean;
  /** `to` absent is everyone. */
  send: (msg: PartyMessage, to?: string) => void;
  /** Called when the view changed. */
  onChange: () => void;
  now: () => number;
  seed: () => number;
  /**
   * Run a broadcast soon rather than now. Eight players sending a score four
   * times a second would otherwise be thirty-two snapshots a second, each to
   * seven peers; coalesced, it is one per tick. Tests pass `fn => fn()`.
   */
  defer: (fn: () => void) => void;
}

/** Names come from the code, so a new host keeps naming people the old host's way. */
function nameBase(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return h % 100;
}

export class PartySession {
  /** Only in the host's browser. */
  party: Party | null = null;
  /** The latest snapshot: the host's own, or the last one it sent. */
  view: PartySnapshot | null = null;
  /** Peers currently connected to us. Never includes ourselves. */
  readonly peers = new Set<string>();
  private readonly base: number;
  private pending = false;

  constructor(private readonly o: SessionOptions) {
    this.base = nameBase(o.code);
    if (o.creator) {
      // Alone, so there is nobody to send to yet: set the view and stop. (A
      // publish here would call `send` before the caller holds this object.)
      const party = new Party(o.seed);
      party.born = o.now();
      party.join(o.selfId, this.nameFor(party));
      this.party = party;
      this.view = party.snapshot();
    }
  }

  get isHost() {
    return this.party !== null;
  }

  // ── Connections ────────────────────────────────────────────────────────

  peerJoined(id: string) {
    this.peers.add(id);
    if (!this.party) return;
    // Every connected peer is a member. A guest needs no "hello": being in
    // the room is the hello.
    if (!this.party.members.has(id)) this.party.join(id, this.nameFor(this.party));
    this.publish();
  }

  peerLeft(id: string) {
    this.peers.delete(id);
    if (this.party) {
      this.party.leave(id);
      this.publish();
      return;
    }
    if (this.view && this.view.hostId === id) this.succeed(id);
  }

  // ── Messages ───────────────────────────────────────────────────────────

  receive(msg: PartyMessage, from: string) {
    if (msg.t === "state") {
      if (msg.snap.hostId !== from) return; // only a host speaks for a party
      if (this.party) {
        if (!beats(msg.snap, this.party.snapshot())) {
          // We win the collision. Say so, and they will yield.
          this.o.send({ t: "state", snap: this.party.snapshot() }, from);
          return;
        }
        this.party = null;
      } else if (
        this.view &&
        this.view.hostId !== from &&
        this.peers.has(this.view.hostId) &&
        !beats(msg.snap, this.view)
      ) {
        // A guest caught between two hosts follows the same rule they do, or
        // it ends up in the party that is about to stop existing.
        return;
      }
      this.view = msg.snap;
      this.o.onChange();
      return;
    }

    if (msg.t === "act" && this.party) {
      const before = this.party.members.get(from);
      const was = before ? `${before.score}:${before.done}` : "";
      if (msg.a === "score") this.party.score(from, msg.n);
      else this.party.finish(from, msg.n);
      const after = this.party.members.get(from);
      if (after && `${after.score}:${after.done}` !== was) this.publish();
      else if (this.party.phase !== this.view?.phase) this.publish();
    }
  }

  // ── What the player can do ─────────────────────────────────────────────

  pick(game: string) {
    if (this.party?.pick(this.o.selfId, game)) this.publish();
  }

  start() {
    if (this.party?.start(this.o.selfId, this.o.now())) this.publish();
  }

  go(href: string) {
    if (this.party?.go(this.o.selfId, href)) this.publish();
  }

  toLobby() {
    if (this.party?.toLobby(this.o.selfId)) this.publish();
  }

  score(n: number) {
    if (this.party) {
      if (this.party.score(this.o.selfId, n)) this.publish();
    } else if (this.view) this.o.send({ t: "act", a: "score", n }, this.view.hostId);
  }

  done(n: number) {
    if (this.party) {
      this.party.finish(this.o.selfId, n);
      this.publish();
    } else if (this.view) this.o.send({ t: "act", a: "done", n }, this.view.hostId);
  }

  /** The host's clock: a round nobody finishes still ends. */
  tick() {
    if (this.party?.tick(this.o.now())) this.publish();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private host(party: Party) {
    this.party = party;
    if (!party.members.has(this.o.selfId)) party.join(this.o.selfId, this.nameFor(party));
    party.setHost(this.o.selfId);
    for (const id of this.peers) if (!party.members.has(id)) party.join(id, this.nameFor(party));
    this.publish();
  }

  private nameFor(party: Party) {
    // Unique within a party: names are handed out in join order.
    return guestName(this.base + party.snapshot().joins);
  }

  private publish() {
    if (!this.party || this.pending) return;
    this.pending = true;
    this.o.defer(() => {
      this.pending = false;
      if (!this.party) return;
      this.view = this.party.snapshot();
      this.o.send({ t: "state", snap: this.view });
      this.o.onChange();
    });
  }

  /** The host went away. If we are the heir, we take over. */
  private succeed(gone: string) {
    const snap = this.view!;
    const alive = snap.members
      .filter((m) => m.id !== gone && (m.id === this.o.selfId || this.peers.has(m.id)))
      .sort((a, b) => a.order - b.order);
    if (alive[0]?.id !== this.o.selfId) return; // somebody else inherits; wait for them
    const party = Party.restore(snap, this.o.seed, this.o.now());
    party.leave(gone);
    // Anyone the old host knew who is not connected to us has gone too.
    for (const m of snap.members) {
      if (m.id !== this.o.selfId && !this.peers.has(m.id)) party.leave(m.id);
    }
    this.host(party);
  }
}

/** Two hosts, one code: the older party stays, ties to the smaller host id. */
function beats(a: PartySnapshot, b: PartySnapshot): boolean {
  if (a.born !== b.born) return a.born < b.born;
  return a.hostId < b.hostId;
}
