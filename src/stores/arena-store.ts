import { create } from "zustand";

/**
 * What the match HUD draws. Health and score change a few times a minute, not
 * a few times a frame, so unlike peer positions these genuinely are React
 * state — see lib/net/peers.ts for the other half of that distinction.
 */
export type ArenaPhase = "waiting" | "fighting" | "over";

export interface FighterView {
  id: string;
  name: string;
  hp: number;
  score: number;
  downed: boolean;
}

interface ArenaState {
  connected: boolean;
  error: string | null;
  code: string | null;
  selfId: string | null;
  phase: ArenaPhase;
  winner: string | null;
  fighters: FighterView[];
  /** Bumped when we take a hit, so the screen can flash without a re-render loop. */
  hurtTick: number;
  /** Bumped when we land one. */
  landedTick: number;
  /** Knockdowns, either way round. The sound wants the heavier hit. */
  downTick: number;
  /** Whether the last knockdown was the local fighter going down. */
  downWasMe: boolean;

  setConnection(v: { connected: boolean; code?: string | null; selfId?: string | null; error?: string | null }): void;
  setMatch(v: { phase: ArenaPhase; winner: string | null; fighters: FighterView[] }): void;
  flashHurt(knockdown?: boolean): void;
  flashLanded(knockdown?: boolean): void;
  reset(): void;
}

const empty = {
  connected: false,
  error: null,
  code: null,
  selfId: null,
  phase: "waiting" as ArenaPhase,
  winner: null,
  fighters: [] as FighterView[],
  hurtTick: 0,
  landedTick: 0,
  downTick: 0,
  downWasMe: false,
};

export const useArenaStore = create<ArenaState>((set) => ({
  ...empty,

  setConnection: ({ connected, code, selfId, error }) =>
    set((s) => ({
      connected,
      code: code === undefined ? s.code : code,
      selfId: selfId === undefined ? s.selfId : selfId,
      error: error === undefined ? s.error : error,
    })),
  setMatch: ({ phase, winner, fighters }) => set({ phase, winner, fighters }),
  flashHurt: (knockdown = false) =>
    set((s) => ({
      hurtTick: s.hurtTick + 1,
      downTick: knockdown ? s.downTick + 1 : s.downTick,
      downWasMe: knockdown ? true : s.downWasMe,
    })),
  flashLanded: (knockdown = false) =>
    set((s) => ({
      landedTick: s.landedTick + 1,
      downTick: knockdown ? s.downTick + 1 : s.downTick,
      downWasMe: knockdown ? false : s.downWasMe,
    })),
  reset: () => set({ ...empty }),
}));

/** The two fighters, as "me" and "them" — what every part of the HUD wants. */
export function splitFighters(fighters: FighterView[], selfId: string | null) {
  return {
    me: fighters.find((f) => f.id === selfId) ?? null,
    them: fighters.find((f) => f.id !== selfId) ?? null,
  };
}
