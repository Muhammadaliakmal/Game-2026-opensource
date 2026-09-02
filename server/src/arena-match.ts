import type { Vec3 } from "@/lib/worlddoc";

/**
 * A duel: two people, one world, first to five knockdowns.
 *
 * Pure logic, no Colyseus — the same division as world-session.ts, and for the
 * same reason: the rules of a fight are not a networking concern, and they are
 * only worth trusting if they can be tested without a socket.
 */

export const ARENA = {
  maxHp: 100,
  damage: 25,
  /**
   * Metres. Generous on purpose: positions arrive ~12 times a second and are
   * drawn a further 120 ms in the past, so a reach tuned to what the attacker
   * sees would miss constantly for reasons no player could understand.
   */
  reach: 2.8,
  /** Milliseconds between swings. */
  cooldown: 550,
  /** How long a downed fighter stays down. Short — waiting is not a punishment worth having. */
  respawnDelay: 2000,
  knockdownsToWin: 5,
  /** Two, and only two. A duel with a spectator is a different game. */
  maxFighters: 2,
} as const;

export type Phase = "waiting" | "fighting" | "over";

export interface Fighter {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  score: number;
  /** When they were knocked down, or null while standing. */
  downedAt: number | null;
  lastSwing: number;
}

export type AttackResult =
  | { ok: false; reason: "cooldown" | "downed" | "not-fighting" | "no-target" | "unknown" }
  | { ok: true; targetId: string; hp: number; knockdown: boolean; winner: string | null };

export interface Revival {
  id: string;
  spawn: Vec3;
}

export class ArenaMatch {
  readonly fighters = new Map<string, Fighter>();
  phase: Phase = "waiting";
  winner: string | null = null;

  constructor(private spawn: Vec3) {}

  get full() {
    return this.fighters.size >= ARENA.maxFighters;
  }

  join(id: string, name: string, now: number): Fighter | null {
    if (this.full) return null;
    const fighter: Fighter = {
      id,
      name,
      x: this.spawn[0],
      y: this.spawn[1],
      z: this.spawn[2],
      yaw: 0,
      hp: ARENA.maxHp,
      score: 0,
      downedAt: null,
      lastSwing: 0,
    };
    this.fighters.set(id, fighter);
    this.updatePhase(now);
    return fighter;
  }

  leave(id: string, now: number) {
    this.fighters.delete(id);
    // A duel with one person in it is not a duel. Scores are kept, so someone
    // reconnecting after a dropped connection rejoins the same fight.
    if (this.phase === "fighting") this.phase = "waiting";
    this.updatePhase(now);
  }

  move(id: string, pos: { x: number; y: number; z: number; yaw: number }) {
    const f = this.fighters.get(id);
    if (!f) return;
    f.x = pos.x;
    f.y = pos.y;
    f.z = pos.z;
    f.yaw = pos.yaw;
  }

  /**
   * A short-range pulse: it hits whoever is within reach, regardless of facing.
   *
   * Deliberately not a directional swing. Facing would have to agree between
   * the yaw a client reports, the camera it derives that from, and the model's
   * forward axis — three conventions that only have to disagree once to make
   * every attack silently miss. A pulse is honest about what the server can
   * actually verify: how far apart two people are.
   */
  attack(id: string, now: number): AttackResult {
    const attacker = this.fighters.get(id);
    if (!attacker) return { ok: false, reason: "unknown" };
    if (this.phase !== "fighting") return { ok: false, reason: "not-fighting" };
    if (attacker.downedAt !== null) return { ok: false, reason: "downed" };
    if (now - attacker.lastSwing < ARENA.cooldown) return { ok: false, reason: "cooldown" };

    attacker.lastSwing = now;

    const target = [...this.fighters.values()].find(
      (f) => f.id !== id && f.downedAt === null && this.within(attacker, f)
    );
    if (!target) return { ok: false, reason: "no-target" };

    target.hp = Math.max(0, target.hp - ARENA.damage);
    if (target.hp > 0) {
      return { ok: true, targetId: target.id, hp: target.hp, knockdown: false, winner: null };
    }

    target.downedAt = now;
    attacker.score += 1;
    if (attacker.score >= ARENA.knockdownsToWin) {
      this.phase = "over";
      this.winner = attacker.id;
    }
    return {
      ok: true,
      targetId: target.id,
      hp: 0,
      knockdown: true,
      winner: this.winner,
    };
  }

  /** Stands anyone back up whose respawn delay has elapsed. Called on a timer. */
  tick(now: number): Revival[] {
    if (this.phase === "over") return [];
    const revived: Revival[] = [];
    for (const f of this.fighters.values()) {
      if (f.downedAt === null || now - f.downedAt < ARENA.respawnDelay) continue;
      f.downedAt = null;
      f.hp = ARENA.maxHp;
      f.x = this.spawn[0];
      f.y = this.spawn[1];
      f.z = this.spawn[2];
      revived.push({ id: f.id, spawn: this.spawn });
    }
    return revived;
  }

  /** Both fighters back to full, scores cleared. */
  rematch(now: number) {
    for (const f of this.fighters.values()) {
      f.hp = ARENA.maxHp;
      f.score = 0;
      f.downedAt = null;
      f.lastSwing = 0;
    }
    this.winner = null;
    this.phase = "waiting";
    this.updatePhase(now);
  }

  private updatePhase(now: number) {
    if (this.phase === "over") return;
    this.phase = this.fighters.size === ARENA.maxFighters ? "fighting" : "waiting";
    // Anyone who was down when the match paused stands up for the restart —
    // being knocked out by a timer that ran while nobody could fight is the
    // kind of unfairness that reads as a bug.
    if (this.phase === "fighting") {
      for (const f of this.fighters.values()) {
        if (f.downedAt !== null) f.downedAt = now;
      }
    }
  }

  private within(a: Fighter, b: Fighter) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= ARENA.reach;
  }
}
