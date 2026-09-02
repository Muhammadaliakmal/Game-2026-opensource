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

  setConnection(v: { connected: boolean; code?: string | null; selfId?: string | null; error?: string | null }): void;
  setMatch(v: { phase: ArenaPhase; winner: string | null; fighters: FighterView[] }): void;
  flashHurt(): void;
  flashLanded(): void;
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
  flashHurt: () => set((s) => ({ hurtTick: s.hurtTick + 1 })),
  flashLanded: () => set((s) => ({ landedTick: s.landedTick + 1 })),
  reset: () => set({ ...empty }),
}));

/** The two fighters, as "me" and "them" — what every part of the HUD wants. */
export function splitFighters(fighters: FighterView[], selfId: string | null) {
  return {
    me: fighters.find((f) => f.id === selfId) ?? null,
    them: fighters.find((f) => f.id !== selfId) ?? null,
  };
}
