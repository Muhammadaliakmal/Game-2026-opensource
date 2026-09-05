import { create } from "zustand";

/**
 * What the race HUD draws.
 *
 * Lap, place and phase change a handful of times in a race, not a few times a
 * frame, so unlike rider positions these genuinely are React state — the same
 * distinction lib/net/peers.ts draws for the same reason.
 *
 * `progress` is the exception and is here on purpose: running order changes
 * continuously, and it is the server's number rather than each client's own
 * guess, which is what stops two people disagreeing about who is leading.
 */
export type RacePhase = "waiting" | "countdown" | "racing" | "finished";

export interface RiderView {
  id: string;
  name: string;
  lap: number;
  progress: number;
  place: number;
  timeMs: number;
}

interface RaceStoreState {
  connected: boolean;
  error: string | null;
  code: string | null;
  selfId: string | null;
  phase: RacePhase;
  laps: number;
  /** Milliseconds left on the start lights, 0 when they are not showing. */
  countdownMs: number;
  /**
   * How many riders the grid is waiting for before the lights arm.
   *
   * The server's number, not this client's request — anyone in the room may
   * change it, so the only honest source is the one everybody is reading.
   */
  target: number;
  riders: RiderView[];

  setConnection(v: {
    connected: boolean;
    code?: string | null;
    selfId?: string | null;
    error?: string | null;
  }): void;
  setRace(v: {
    phase: RacePhase;
    laps: number;
    countdownMs: number;
    target: number;
    riders: RiderView[];
  }): void;
  reset(): void;
}

const empty = {
  connected: false,
  error: null,
  code: null,
  selfId: null,
  phase: "waiting" as RacePhase,
  laps: 3,
  countdownMs: 0,
  target: 2,
  riders: [] as RiderView[],
};

export const useRaceStore = create<RaceStoreState>((set) => ({
  ...empty,

  setConnection: ({ connected, code, selfId, error }) =>
    set((s) => ({
      connected,
      code: code === undefined ? s.code : code,
      selfId: selfId === undefined ? s.selfId : selfId,
      error: error === undefined ? s.error : error,
    })),

  setRace: ({ phase, laps, countdownMs, target, riders }) =>
    set({ phase, laps, countdownMs, target, riders }),

  reset: () => set({ ...empty }),
}));

/**
 * Running order: finishers first in the order they crossed, then everyone else
 * by how far round they are.
 *
 * The same comparison the server uses in Race.standings(), repeated here
 * because the HUD ranks the rider list it already has rather than waiting for
 * a separate ordered message.
 */
export function standings(riders: RiderView[]): RiderView[] {
  return [...riders].sort((a, b) => {
    if (a.place > 0 || b.place > 0) {
      if (a.place === 0) return 1;
      if (b.place === 0) return -1;
      return a.place - b.place;
    }
    return b.lap + b.progress - (a.lap + a.progress);
  });
}

/** m:ss.cs, matching the course timer in components/play/course.ts. */
export function formatLapTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
