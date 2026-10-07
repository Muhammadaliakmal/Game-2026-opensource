"use client";

import { create } from "zustand";
import { entryFor } from "./registry";
import { enterLandscape, leaveLandscape } from "./host/orientation";
import { DAILY_HARD_CAP } from "@/lib/arcade-payout";
import {
  creditCoins,
  load,
  recordRun,
  save,
  today,
  type ArcadeSave,
} from "./persistence";

/**
 * What React knows about the arcade.
 *
 * ── The simulation is not in here ────────────────────────────────────────
 *
 * Entities are plain objects owned by the game module. This store holds a
 * coarse snapshot React is allowed to re-render on, and the host pushes score
 * into it at about 10 Hz rather than every step. A `set()` inside `step()`
 * would put a React render inside the sixty-times-a-second budget, which is
 * the single easiest way to lose the frame this whole feature is built around.
 *
 * ── Why `status` and `activeGame` are separate ───────────────────────────
 *
 * `activeGame` is what the R3F bridge reads: non-null means the world's render
 * loop must be stopped, and that has to stay true through loading, playing,
 * pausing and the death screen alike. `status` is what the overlay draws. One
 * field could not answer both without the bridge having to know every state a
 * game can be in.
 */

export type ArcadeStatus = "loading" | "playing" | "paused" | "gameover";

interface ArcadeState {
  activeGame: string | null;
  status: ArcadeStatus;
  /** Pushed from the host at ~10 Hz, never per frame. */
  score: number;
  /** Best per game, mirrored out of `persistence` so React can read it. */
  best: Record<string, number>;
  /** Coins the last finished run paid. Null until one has. */
  earned: number | null;
  /**
   * Where the local player came, on a board cabinet. Null on a runner.
   *
   * Separate from `score` rather than folded into it, because they are not the
   * same kind of number and the result screen reads them differently: a score
   * is compared with a best, and a placement is compared with nothing — you
   * came second, and second last week does not make second today worse.
   */
  placement: { place: number; of: number } | null;
  /** The seed the current run was created with, so it can be replayed. */
  seed: number;
  /** Bumped to ask the host for a fresh game with the same entry. */
  runId: number;
  error: string | null;

  open(id: string, seed?: number): void;
  close(): void;
  restart(): void;
  pause(): void;
  resume(): void;
  setStatus(s: ArcadeStatus): void;
  setCapped(capped: boolean): void;
  setScore(n: number): void;
  /**
   * A run ended. Records the score and shows the death screen at once — the
   * payout is a separate, later fact, because it is a network round trip.
   */
  finish(gameId: string, score: number): void;
  /**
   * A board match ended, and this is where the player came.
   *
   * Deliberately not routed through `finish`: `recordRun` keeps a best *score*
   * per game, and a placement written into it would record "your best Ludo is
   * a 1" — a bigger number being a worse result. Board cabinets keep no best
   * until there is something worth keeping.
   */
  finishPlaced(gameId: string, place: number, of: number): void;
  /** What the server actually paid, once it has said. */
  credit(coins: number): void;
  /**
   * Add a watched rewarded ad's coins to this run's payout (`RewardedDouble`).
   * Adds rather than replaces, so the results panel counts the doubled total.
   */
  creditBonus(coins: number): void;
  /** True once today's arcade ceiling has been reached. */
  capped: boolean;
  /**
   * Whether the run on the death screen can be continued — the cabinet has
   * `revive` and this run has not used its one continue. Set by the host.
   */
  canRevive: boolean;
  setCanRevive(can: boolean): void;
  /** Bumped to ask the host to revive the current run (`RewardedContinue`). */
  reviveTick: number;
  /** Coins already paid to this run before its continue, so the panel counts both. */
  paidBefore: number;
  revive(): void;
  fail(message: string): void;
}

/**
 * Read once, lazily, and only in a browser: `load()` touches localStorage,
 * and this module is imported by a page that server-renders.
 */
let saved: ArcadeSave | null = null;
const savedNow = (): ArcadeSave => (saved ??= load());

export const useArcade = create<ArcadeState>((set, get) => ({
  activeGame: null,
  status: "loading",
  score: 0,
  best: {},
  earned: null,
  placement: null,
  capped: false,
  seed: 0,
  runId: 0,
  error: null,

  open: (id, seed) => {
    const entry = entryFor(id);
    if (!entry) return;
    // Inside the opening gesture, which is the only place it can work. A
    // board cabinet lays itself out for portrait and is left alone.
    if (!entry.board) enterLandscape();
    const s = typeof window === "undefined" ? { best: {} } : savedNow();
    set({
      activeGame: id,
      status: "loading",
      score: 0,
      earned: null,
      placement: null,
      error: null,
      seed: seed ?? (Math.random() * 0xffffffff) >>> 0,
      runId: get().runId + 1,
      canRevive: false,
      paidBefore: 0,
      best: s.best,
      // Carried in from the save so the first run of a session already knows
      // whether the day is spent, rather than learning it on the death screen.
      capped:
        typeof window !== "undefined" && savedNow().lastPlayDate === today()
          ? savedNow().coinsEarnedToday >= DAILY_HARD_CAP
          : false,
    });
  },

  close: () => {
    leaveLandscape();
    set({
      activeGame: null,
      status: "loading",
      score: 0,
      placement: null,
      error: null,
    });
  },

  // A new run of the same game: the host watches `runId` and rebuilds. The
  // seed is rerolled, because replaying an identical course after dying on it
  // is a different game (a puzzle) from the one these are.
  restart: () =>
    set((s) => ({
      status: "loading",
      score: 0,
      earned: null,
      placement: null,
      error: null,
      seed: (Math.random() * 0xffffffff) >>> 0,
      runId: s.runId + 1,
      canRevive: false,
      paidBefore: 0,
    })),

  pause: () => set((s) => (s.status === "playing" ? { status: "paused" } : {})),
  resume: () => set((s) => (s.status === "paused" ? { status: "playing" } : {})),
  setStatus: (status) => set({ status }),
  setCapped: (capped: boolean) => set({ capped }),
  setScore: (score) => set({ score }),

  finish: (gameId, score) => {
    const next = recordRun(savedNow(), gameId, score);
    saved = next;
    save(next);
    set({ status: "gameover", score, best: next.best });
  },

  finishPlaced: (_gameId, place, of) =>
    set({ status: "gameover", score: 0, placement: { place, of } }),

  credit: (coins) => {
    if (coins > 0) {
      const next = creditCoins(savedNow(), coins);
      saved = next;
      save(next);
    }
    set((s) => ({ earned: coins + s.paidBefore }));
  },

  canRevive: false,
  setCanRevive: (canRevive) => set({ canRevive }),
  reviveTick: 0,
  paidBefore: 0,
  revive: () =>
    set((s) =>
      s.status === "gameover" && s.canRevive
        ? {
            status: "playing",
            canRevive: false,
            reviveTick: s.reviveTick + 1,
            paidBefore: s.earned ?? 0,
            earned: null,
          }
        : {}
    ),

  creditBonus: (coins) => {
    if (coins <= 0) return;
    const next = creditCoins(savedNow(), coins);
    saved = next;
    save(next);
    set((s) => ({ earned: (s.earned ?? 0) + coins }));
  },

  fail: (message) => set({ status: "gameover", error: message }),
}));

/** The bridge's question, as a selector so it never re-renders on a score. */
export const arcadeIsOpen = (s: ArcadeState) => s.activeGame !== null;
