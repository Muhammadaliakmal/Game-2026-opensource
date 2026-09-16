import {
  GRID_SLOTS,
  MAX_RIDERS,
  RACE_LAPS,
  SECTORS,
  lapProgress,
  sectorAt,
} from "@/lib/race-track";

/**
 * A race: up to four riders, three laps of Neon Circuit.
 *
 * Pure logic, no Colyseus — the same division as world-session.ts, and for
 * the same reason: the rules of a race are not a
 * networking concern, and they are only worth trusting if they can be tested
 * without a socket.
 *
 * The server counts the laps. It already receives every rider's position for
 * presence, so deriving progress from those costs nothing extra and means a
 * client cannot simply announce that it has won. It is not proof against a
 * modified client teleporting round the track — that needs speed and continuity
 * checks nobody can tune without real traffic to look at — but it does mean the
 * lap counter is one authority rather than four opinions.
 */

export const RACE = {
  laps: RACE_LAPS,
  maxRiders: MAX_RIDERS,
  /** Milliseconds of countdown once a race is armed. Three lights and a go. */
  countdownMs: 4000,
  /**
   * How long the race stays open after the winner crosses.
   *
   * Racing until the last rider finishes punishes everyone for one person
   * having a bad time; ending the instant the winner crosses denies everybody
   * else the finish they were about to have. A timer after first place is the
   * usual answer and it is the right one.
   */
  finishGraceMs: 30_000,
  /** Below two riders there is nobody to race, so a lone rider must ask. */
  minAutoStart: 2,
} as const;

export type RacePhase = "waiting" | "countdown" | "racing" | "finished";

export interface Rider {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /**
   * Which lap they are on: 0 on the grid, 1 after crossing the line to start.
   * They have finished once it would exceed `laps`, so this never displays
   * above RACE.laps.
   */
  lap: number;
  /** Last ordered sector entered. Riders start in the final one, behind the line. */
  sector: number;
  /** Fraction of the current lap completed, 0..1. Ranking uses lap + this. */
  progress: number;
  /** Finishing position, 1-based, or 0 while still racing. */
  place: number;
  /** Milliseconds from the green light to their last crossing, or 0. */
  timeMs: number;
  /** Index into GRID_SLOTS — kept so a rider keeps their slot on a rematch. */
  slot: number;
}

/** Where a rider sits before the lights, and where a reset puts them back. */
export function gridPose(slot: number) {
  const g = GRID_SLOTS[slot % GRID_SLOTS.length]!;
  return { x: g[0], y: g[1], z: g[2] };
}

export class Race {
  readonly riders = new Map<string, Rider>();
  phase: RacePhase = "waiting";
  /** Timestamp the lights go green, while counting down. */
  startsAt = 0;
  /** Timestamp the green light actually happened, for lap times. */
  startedAt = 0;
  /** When the first rider finished, so the grace timer can run. */
  firstFinishAt = 0;

  /**
   * How many riders the grid is waiting for before the lights arm themselves.
   *
   * The room used to arm the moment a second rider joined, which is right for
   * a pick-up race and wrong for the case somebody actually asked for: you
   * send the code to three friends, the first one arrives, and the race starts
   * without the other two. Naming the size up front is the fix — a four-rider
   * grid waits for four.
   *
   * Defaults to `minAutoStart`, so a room created without an opinion behaves
   * exactly as it always did. Anyone in the room may change it while waiting,
   * and `arm()` is still available to override it — a grid of four that only
   * ever got two riders must not be a race nobody can start.
   */
  target: number = RACE.minAutoStart;

  get full() {
    return this.riders.size >= RACE.maxRiders;
  }

  /**
   * Set the grid size. Ignored once the lights are running — changing the
   * number a race is waiting for while it is already under way describes
   * nothing, and silently re-arming a live race would be worse.
   */
  setTarget(n: number, now: number): boolean {
    if (this.phase !== "waiting") return false;
    const next = Math.max(1, Math.min(RACE.maxRiders, Math.floor(n)));
    if (next === this.target) return false;
    this.target = next;
    // A grid that has already filled to its new size should go now rather
    // than wait for a rider who is not coming.
    if (this.riders.size >= this.target) this.arm(now);
    return true;
  }

  /** Slots are reused, so a rider leaving frees the grid position they had. */
  private freeSlot(): number {
    const taken = new Set([...this.riders.values()].map((r) => r.slot));
    for (let i = 0; i < RACE.maxRiders; i++) if (!taken.has(i)) return i;
    return 0;
  }

  join(id: string, name: string, now: number): Rider | null {
    if (this.full) return null;

    const slot = this.freeSlot();
    const pose = gridPose(slot);
    const rider: Rider = {
      id,
      name,
      ...pose,
      yaw: 0,
      lap: 0,
      // The grid is behind the line, which is the last sector of the lap. A
      // rider therefore enters sector 0 by crossing the line to start, and the
      // ordering rule below gets that first crossing for free.
      sector: SECTORS - 1,
      progress: lapProgress(pose.x, pose.z),
      place: 0,
      timeMs: 0,
      slot,
    };
    this.riders.set(id, rider);

    // Filling the grid is what arms the race — see `target`. A room that was
    // never given a size is still waiting for two, which is the old behaviour.
    if (this.phase === "waiting" && this.riders.size >= this.target) {
      this.arm(now);
    }
    return rider;
  }

  leave(id: string) {
    this.riders.delete(id);
    // Everyone left mid-race: there is nothing to finish, so fall back to
    // waiting rather than leaving an empty race running forever.
    if (this.riders.size === 0) {
      this.phase = "waiting";
      this.startsAt = 0;
      this.startedAt = 0;
      this.firstFinishAt = 0;
    }
  }

  /** Begin the countdown. Idempotent, so a second request is harmless. */
  arm(now: number): boolean {
    if (this.phase !== "waiting") return false;
    if (this.riders.size === 0) return false;
    this.phase = "countdown";
    this.startsAt = now + RACE.countdownMs;
    for (const r of this.riders.values()) this.resetToGrid(r);
    return true;
  }

  private resetToGrid(r: Rider) {
    const pose = gridPose(r.slot);
    r.x = pose.x;
    r.y = pose.y;
    r.z = pose.z;
    r.lap = 0;
    r.sector = SECTORS - 1;
    r.progress = lapProgress(pose.x, pose.z);
    r.place = 0;
    r.timeMs = 0;
  }

  /**
   * A position update, and the lap accounting that hangs off it.
   *
   * Sector order is the whole anti-shortcut rule: a rider advances only into
   * the sector after the one they are in, so nudging back and forth over the
   * line counts nothing and cutting the infield strands them until they rejoin
   * where they left.
   */
  move(
    id: string,
    p: { x: number; y: number; z: number; yaw: number },
    now: number
  ): { lapped: boolean; finished: boolean } {
    const r = this.riders.get(id);
    if (!r) return { lapped: false, finished: false };

    r.x = p.x;
    r.y = p.y;
    r.z = p.z;
    r.yaw = p.yaw;

    if (this.phase !== "racing" || r.place > 0) {
      r.progress = lapProgress(p.x, p.z);
      return { lapped: false, finished: false };
    }

    const s = sectorAt(p.x, p.z);
    r.progress = lapProgress(p.x, p.z);

    if (s !== (r.sector + 1) % SECTORS) return { lapped: false, finished: false };

    r.sector = s;
    if (s !== 0) return { lapped: false, finished: false };

    // Crossing the line. The first one starts lap 1 rather than completing a
    // lap, which is what having the grid behind the line means.
    r.lap += 1;
    if (r.lap <= RACE.laps) return { lapped: true, finished: false };

    r.lap = RACE.laps;
    r.place = this.nextPlace();
    r.timeMs = Math.max(0, now - this.startedAt);
    if (r.place === 1) this.firstFinishAt = now;
    this.checkAllFinished();
    return { lapped: true, finished: true };
  }

  private nextPlace(): number {
    let taken = 0;
    for (const r of this.riders.values()) if (r.place > 0) taken++;
    return taken + 1;
  }

  private checkAllFinished() {
    for (const r of this.riders.values()) if (r.place === 0) return;
    this.phase = "finished";
  }

  /**
   * The clock. Called by whatever owns a socket, because a countdown ending and
   * a grace period expiring are things only something with a timer can notice.
   *
   * Returns true when the phase changed and the room should tell everyone.
   */
  tick(now: number): boolean {
    if (this.phase === "countdown" && now >= this.startsAt) {
      this.phase = "racing";
      this.startedAt = this.startsAt;
      return true;
    }
    if (
      this.phase === "racing" &&
      this.firstFinishAt > 0 &&
      now - this.firstFinishAt >= RACE.finishGraceMs
    ) {
      // Everyone still out on track is classified in the order they were in.
      for (const r of this.standings()) {
        if (r.place === 0) r.place = this.nextPlace();
      }
      this.phase = "finished";
      return true;
    }
    return false;
  }

  /** Back to the grid, same riders, same slots. */
  rematch(now: number) {
    this.phase = "waiting";
    this.startsAt = 0;
    this.startedAt = 0;
    this.firstFinishAt = 0;
    for (const r of this.riders.values()) this.resetToGrid(r);
    if (this.riders.size >= this.target) this.arm(now);
  }

  /**
   * Riders in running order.
   *
   * Finishers first in the order they crossed, then everyone still out there by
   * how far round they are — laps plus the fraction of this one, which is a
   * single comparable number precisely because progress never decreases within
   * a lap.
   */
  standings(): Rider[] {
    return [...this.riders.values()].sort((a, b) => {
      if (a.place > 0 || b.place > 0) {
        if (a.place === 0) return 1;
        if (b.place === 0) return -1;
        return a.place - b.place;
      }
      return b.lap + b.progress - (a.lap + a.progress);
    });
  }
}
