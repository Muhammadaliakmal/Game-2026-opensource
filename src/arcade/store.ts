"use client";

import { create } from "zustand";
import { entryFor } from "./registry";
import { load, recordRun, save, type ArcadeSave } from "./persistence";

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
  setScore(n: number): void;
  /** Called by the host when a run ends. Records the best and the payout. */
  finish(gameId: string, score: number, coins: number): void;
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
  seed: 0,
  runId: 0,
  error: null,

  open: (id, seed) => {
    if (!entryFor(id)) return;
    const s = typeof window === "undefined" ? { best: {} } : savedNow();
    set({
      activeGame: id,
      status: "loading",
      score: 0,
      earned: null,
      error: null,
      seed: seed ?? (Math.random() * 0xffffffff) >>> 0,
      runId: get().runId + 1,
      best: s.best,
    });
  },

  close: () =>
    set({ activeGame: null, status: "loading", score: 0, error: null }),

  // A new run of the same game: the host watches `runId` and rebuilds. The
  // seed is rerolled, because replaying an identical course after dying on it
  // is a different game (a puzzle) from the one these are.
  restart: () =>
    set((s) => ({
      status: "loading",
      score: 0,
      earned: null,
      error: null,
      seed: (Math.random() * 0xffffffff) >>> 0,
      runId: s.runId + 1,
    })),

  pause: () => set((s) => (s.status === "playing" ? { status: "paused" } : {})),
  resume: () => set((s) => (s.status === "paused" ? { status: "playing" } : {})),
  setStatus: (status) => set({ status }),
  setScore: (score) => set({ score }),

  finish: (gameId, score, coins) => {
    const next = recordRun(savedNow(), gameId, score, coins);
    saved = next;
    save(next);
    set({ status: "gameover", score, earned: coins, best: next.best });
  },

  fail: (message) => set({ status: "gameover", error: message }),
}));

/** The bridge's question, as a selector so it never re-renders on a score. */
export const arcadeIsOpen = (s: ArcadeState) => s.activeGame !== null;
