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

interface CourseState {
  /** `performance.now()` when the current attempt began, or null if idle. */
  startedAt: number | null;
  /** Final time in ms once the goal is reached, else null. */
  finishedMs: number | null;
  /** Best time for this world, in ms, restored from the browser. */
  best: number | null;
  /** Which world's best time is loaded — guards against showing another's. */
  worldId: string | null;

  /** Begin (or restart) the clock. Safe to call on every respawn. */
  begin(worldId: string): void;
  /** Record an arrival. Ignored if the run has already been completed. */
  complete(): void;
  /** Leave the course entirely — switching worlds, or leaving Play. */
  clear(): void;
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

  begin: (worldId) =>
    set((s) => ({
      startedAt: performance.now(),
      finishedMs: null,
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

  clear: () => set({ startedAt: null, finishedMs: null }),
}));

/** m:ss.cs — centiseconds, because tenths are too coarse to separate runs. */
export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
