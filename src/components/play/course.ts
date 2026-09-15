import { create } from "zustand";

/**
 * A run at a course.
 *
 * Only worlds with a `goal` have one — see WorldDoc.goal for why most worlds
 * do not. Everything here is low frequency (a run starts, a run ends) so it is
 * real store state the HUD renders from; the per-frame distance test that
 * decides when to call `complete` lives in GoalZone and never touches React.
 *
 * The clock is a start timestamp rather than an accumulating counter. A
 * counter has to be advanced by something, which means either a frame loop
 * writing to the store sixty times a second or a timer that drifts; a
 * timestamp is read whenever anyone wants to display it and is exact.
 */

export interface CourseState {
  /** `performance.now()` when the current attempt began, or null if idle. */
  startedAt: number | null;
  /** Final time in ms once the goal is reached, else null. */
  finishedMs: number | null;
  /** Best time for this world, in ms, restored from the browser. */
  best: number | null;
  /** Which world's best time is loaded — guards against showing another's. */
  worldId: string | null;

  /**
   * The Author time for the loaded world, in ms, or null if it has none.
   *
   * The whole medal ladder is multiples of this one number, and until now the
   * HUD derived it from the world's id — which worked for the twenty courses
   * that ship, whose Author times are a table keyed by slug, and returned null
   * for every course a player has ever built. A world's id cannot answer this;
   * only its geometry can, and the server has already solved that and stored
   * it. So it arrives as a number when the world loads.
   */
  authorMs: number | null;
  /** Which world `authorMs` describes — the same guard `worldId` is. */
  authorWorldId: string | null;

  /**
   * Index of the checkpoint the runner holds, or -1 for none.
   *
   * The whole of the parkour resume mechanic is this number: a fall returns
   * you to it, and the clock keeps running because you did not restart the
   * course, you fell off part of it.
   */
  checkpoint: number;
  /** How many the course has, so the HUD can say 2/5 rather than just 2. */
  checkpointCount: number;
  /**
   * Deaths this attempt: falls and hazards, not manual respawns. An obby's
   * scoreboard is its death count as much as its clock, and a finish panel
   * that says "died 23 times" is the one line that gets a rematch.
   */
  deaths: number;

  /** Begin a fresh run: clock from zero, no checkpoints held. */
  begin(worldId: string): void;
  /** Record an arrival. Ignored if the run has already been completed. */
  complete(): void;
  /** Leave the course entirely — switching worlds, or leaving Play. */
  clear(): void;

  /** The course has this many checkpoints. Set when the world loads. */
  setCheckpointCount(n: number): void;
  /**
   * The Author time for a world. Set when the world loads, not when a run
   * begins: a run can begin, end and begin again without the geometry moving,
   * and this survives every one of those.
   */
  setAuthorMs(worldId: string, ms: number | null): void;
  /** A checkpoint was reached. Forward-only; the caller has already checked. */
  reachCheckpoint(index: number): void;
  /** The runner fell or touched a hazard. Counted whether or not a run is on. */
  died(): void;
  /**
   * The runner died and came back.
   *
   * With a checkpoint held this changes nothing at all — that is the point of
   * holding one. Without one it is a fresh attempt, which is what every fall
   * used to be.
   */
  respawned(): void;
  /** Start the whole course again, deliberately. Clears checkpoints. */
  restart(): void;
}

const keyFor = (worldId: string) => `blockworld:best:${worldId}`;

/**
 * Best times are per world and per browser.
 *
 * Deliberately localStorage and not the database: a time is only meaningful
 * against the exact course that produced it, a remix can change that course
 * arbitrarily, and a leaderboard nobody can trust is worse than none. This is
 * the honest version — your own best, on this machine, as a reason to run it
 * again.
 *
 * Every access is wrapped: storage throws outright in some privacy modes
 * rather than returning null, and a course that cannot be played because the
 * best time could not be read would be a poor trade.
 */
function readBest(worldId: string): number | null {
  try {
    const raw = localStorage.getItem(keyFor(worldId));
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

function writeBest(worldId: string, ms: number) {
  try {
    localStorage.setItem(keyFor(worldId), String(Math.round(ms)));
  } catch {
    /* nothing to recover — the run still counts for this session */
  }
}

export const useCourse = create<CourseState>((set, get) => ({
  startedAt: null,
  finishedMs: null,
  best: null,
  worldId: null,
  authorMs: null,
  authorWorldId: null,
  checkpoint: -1,
  checkpointCount: 0,
  deaths: 0,

  begin: (worldId) =>
    set((s) => ({
      startedAt: performance.now(),
      finishedMs: null,
      checkpoint: -1,
      deaths: 0,
      // Re-read only when the world actually changes, so a respawn does not
      // hit storage on every fall.
      best: s.worldId === worldId ? s.best : readBest(worldId),
      worldId,
    })),

  complete: () => {
    const s = get();
    if (s.startedAt === null || s.finishedMs !== null) return;
    const ms = performance.now() - s.startedAt;
    const best = s.best === null || ms < s.best ? ms : s.best;
    if (s.worldId && best === ms) writeBest(s.worldId, ms);
    set({ finishedMs: ms, best });
  },

  clear: () =>
    set({ startedAt: null, finishedMs: null, checkpoint: -1, checkpointCount: 0, deaths: 0 }),

  setCheckpointCount: (n) => set({ checkpointCount: n, checkpoint: -1 }),

  setAuthorMs: (worldId, ms) => set({ authorMs: ms, authorWorldId: worldId }),

  reachCheckpoint: (index) =>
    set((s) => (index > s.checkpoint ? { checkpoint: index } : s)),

  // Not after the finish: walking off the podium is not a death the panel
  // that is already up should start recounting.
  died: () => set((s) => (s.finishedMs === null ? { deaths: s.deaths + 1 } : s)),

  respawned: () => {
    const s = get();
    if (s.worldId === null) return;
    // A checkpoint means the attempt continues. Restarting the clock here
    // would make every fall erase the time you had already put in, which is
    // the opposite of what a checkpoint is for.
    if (s.checkpoint >= 0) return;
    set({ startedAt: performance.now(), finishedMs: null, deaths: 0 });
  },

  restart: () => {
    const s = get();
    if (s.worldId === null) return;
    set({ startedAt: performance.now(), finishedMs: null, checkpoint: -1, deaths: 0 });
  },
}));

/**
 * The Author time for the run in progress, or null.
 *
 * Read through this rather than off `authorMs` directly. The two are set from
 * different places — the loader knows the geometry, `begin` knows the run —
 * and switching worlds without reloading (build to play, one course to the
 * next) would otherwise show the previous world's ladder for a frame, which is
 * the same trap `best` is guarded against.
 */
export const runAuthorMs = (s: CourseState): number | null =>
  s.worldId !== null && s.worldId === s.authorWorldId ? s.authorMs : null;

/** m:ss.cs — centiseconds, because tenths are too coarse to separate runs. */
export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
