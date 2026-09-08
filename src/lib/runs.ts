"use client";

import { create } from "zustand";
import type { GhostTrack } from "./ghost";
import type { Medal } from "./medals";

/**
 * The leaderboard and the ghost, client side.
 *
 * ── Why this is store state and the ghost's playback is not ──────────────
 *
 * Everything here changes at human frequency: a board loads once when a course
 * opens, and a run is submitted once when it ends. The ghost's *position* is a
 * different thing entirely — it moves every frame — so the track is kept here
 * and `GhostRunner` reads it out of the store once and then never touches
 * React again. Same division as `race/telemetry.ts`.
 *
 * ── Failure is quiet, deliberately ───────────────────────────────────────
 *
 * None of this is the game. A board that will not load and a run that will not
 * submit both leave the player with a finished course, a time, a medal and a
 * personal best in their browser — which is everything the run was worth on
 * its own. So a failed request sets `error` for the panel to mention in a line
 * of small text and is never allowed to interrupt anything.
 */

export interface BoardRow {
  userId: string;
  name: string;
  timeMs: number;
  medal: Medal | null;
  hasGhost: boolean;
}

export interface Board {
  top: BoardRow[];
  /** The caller's own entry, which is usually not in `top`. */
  me: BoardRow | null;
  /** 1-based, or null if they have never posted a time here. */
  rank: number | null;
}

/** Which run the ghost on screen is a replay of. */
export type GhostWho = "best" | "me";

interface RunsState {
  /** Which world the loaded board and ghost belong to. */
  worldId: string | null;
  board: Board | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;

  ghost: GhostTrack | null;
  ghostName: string | null;
  ghostMs: number | null;
  ghostWho: GhostWho;

  /**
   * Coins this finish just earned, or null if it earned none.
   *
   * Held here rather than in the shop store because it belongs to *this run*:
   * it is cleared when the next one starts, and the shop's balance is a
   * separate, longer-lived fact. The panel needs both — what you just got, and
   * what you now have.
   */
  earned: number | null;

  /** Load (or reload) the board for a world. */
  load(worldId: string): Promise<void>;
  /** Fetch a replay to race against. */
  loadGhost(worldId: string, who: GhostWho): Promise<void>;
  /** Post a finished run. Refreshes the board if it was an improvement. */
  submit(worldId: string, timeMs: number, ghost: GhostTrack | null): Promise<void>;
  /** Leaving the course. */
  clear(): void;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export const useRuns = create<RunsState>((set, get) => ({
  worldId: null,
  board: null,
  loading: false,
  submitting: false,
  error: null,
  earned: null,
  ghost: null,
  ghostName: null,
  ghostMs: null,
  ghostWho: "best",

  load: async (worldId) => {
    set({ worldId, loading: true, error: null });
    try {
      const board = await json<Board>(
        `/api/worlds/${encodeURIComponent(worldId)}/runs`
      );
      // A world switch mid-request must not land the old board on the new
      // course. Cheaper and more obvious than an AbortController for a
      // request nothing is waiting on.
      if (get().worldId !== worldId) return;
      set({ board, loading: false });
    } catch {
      if (get().worldId !== worldId) return;
      set({ loading: false, error: "Leaderboard unavailable" });
    }
  },

  loadGhost: async (worldId, who) => {
    set({ ghostWho: who });
    try {
      const r = await json<{
        ghost: GhostTrack | null;
        name: string | null;
        timeMs: number | null;
      }>(`/api/worlds/${encodeURIComponent(worldId)}/runs/ghost?who=${who}`);
      if (get().worldId !== worldId || get().ghostWho !== who) return;
      set({ ghost: r.ghost, ghostName: r.name, ghostMs: r.timeMs });
    } catch {
      // No ghost is a normal outcome — nobody has run this map yet — and it
      // looks the same to the player as a ghost that failed to load.
      if (get().worldId !== worldId) return;
      set({ ghost: null, ghostName: null, ghostMs: null });
    }
  },

  submit: async (worldId, timeMs, ghost) => {
    set({ submitting: true });
    try {
      const r = await json<{ improved: boolean; earned?: number; coins?: number | null }>(
        `/api/worlds/${encodeURIComponent(worldId)}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ timeMs: Math.round(timeMs), ghost }),
        }
      );
      set({ submitting: false, earned: r.earned && r.earned > 0 ? r.earned : null });
      // The balance moved, so anything showing it is now stale. Written
      // straight in rather than refetched: the server just told us the answer.
      if (typeof r.coins === "number") {
        const { useShop } = await import("./shop");
        useShop.setState({ coins: r.coins });
      }
      // Only refetch when the standings can have moved. Most runs are slower
      // than the runner's own best, and re-fetching for those would mean a
      // request per attempt on a map somebody is grinding.
      if (r.improved && get().worldId === worldId) await get().load(worldId);
    } catch (e) {
      // 401 is not a failure worth reporting: a signed-out player was never
      // going to be on the board and telling them so at the moment they
      // finished a course is a poor way to celebrate it.
      const unauthorised = e instanceof Error && e.message === "401";
      set({
        submitting: false,
        error: unauthorised ? null : "Could not post that run",
      });
    }
  },

  clear: () =>
    set({
      worldId: null,
      board: null,
      loading: false,
      submitting: false,
      error: null,
      ghost: null,
      ghostName: null,
      ghostMs: null,
      earned: null,
    }),
}));
