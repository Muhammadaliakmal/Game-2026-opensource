"use client";

import { create } from "zustand";
import type { GhostTrack } from "./ghost";
import type { Medal } from "./medals";
import { dayKey } from "./daily";
import { recordFinish } from "./streak";

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

/**
 * Which run the ghost on screen is a replay of: the record, your own, or a
 * named player's — the last being what a "beat my time" link points at.
 */
export type GhostWho = "best" | "me" | `user:${string}`;

/** All time, or this ISO week. See the `week_ms` column for why both exist. */
export type BoardPeriod = "all" | "week";

interface RunsState {
  /** Which world the loaded board and ghost belong to. */
  worldId: string | null;
  board: Board | null;
  /** Which board is loaded. The panel toggles it; the choice is remembered. */
  period: BoardPeriod;
  loading: boolean;
  submitting: boolean;
  error: string | null;

  ghost: GhostTrack | null;
  ghostName: string | null;
  ghostMs: number | null;
  ghostWho: GhostWho;
  /**
   * A ghost request is in flight. `GhostRunner` falls back to the record
   * when the chosen ghost turns out not to exist, and "does not exist" and
   * "has not arrived yet" look identical on `ghost` alone — without this the
   * fallback fired on mount and the record overrode the personal run every
   * time.
   */
  ghostLoading: boolean;

  /**
   * Coins this finish just earned, or null if it earned none.
   *
   * Held here rather than in the shop store because it belongs to *this run*:
   * it is cleared when the next one starts, and the shop's balance is a
   * separate, longer-lived fact. The panel needs both — what you just got, and
   * what you now have.
   */
  earned: number | null;
  /** The payout was doubled. Only ever true beside a non-null `earned`. */
  lucky: boolean;
  /** The daily challenge bonus this finish collected, or null. */
  daily: number | null;

  /** Load (or reload) the board for a world. */
  load(worldId: string, period?: BoardPeriod): Promise<void>;
  /** Switch boards for the loaded world. */
  setPeriod(period: BoardPeriod): Promise<void>;
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
  period: readPeriod(),
  loading: false,
  submitting: false,
  error: null,
  earned: null,
  lucky: false,
  daily: null,
  ghost: null,
  ghostName: null,
  ghostMs: null,
  ghostWho: "best",
  ghostLoading: false,

  load: async (worldId, period = get().period) => {
    set({ worldId, period, loading: true, error: null });
    try {
      const board = await json<Board>(
        `/api/worlds/${encodeURIComponent(worldId)}/runs?period=${period}`
      );
      // A world switch mid-request must not land the old board on the new
      // course — nor a period switch the other board. Cheaper and more
      // obvious than an AbortController for a request nothing is waiting on.
      if (get().worldId !== worldId || get().period !== period) return;
      set({ board, loading: false });
    } catch {
      if (get().worldId !== worldId) return;
      set({ loading: false, error: "Leaderboard unavailable" });
    }
  },

  setPeriod: async (period) => {
    if (period === get().period) return;
    writePeriod(period);
    const { worldId } = get();
    if (worldId) await get().load(worldId, period);
    else set({ period });
  },

  loadGhost: async (worldId, who) => {
    set({ ghostWho: who, ghostLoading: true });
    try {
      const r = await json<{
        ghost: GhostTrack | null;
        name: string | null;
        timeMs: number | null;
      }>(`/api/worlds/${encodeURIComponent(worldId)}/runs/ghost?who=${who}`);
      if (get().worldId !== worldId || get().ghostWho !== who) return;
      set({ ghost: r.ghost, ghostName: r.name, ghostMs: r.timeMs, ghostLoading: false });
    } catch {
      // No ghost is a normal outcome — nobody has run this map yet — and it
      // looks the same to the player as a ghost that failed to load.
      if (get().worldId !== worldId || get().ghostWho !== who) return;
      set({ ghost: null, ghostName: null, ghostMs: null, ghostLoading: false });
    }
  },

  submit: async (worldId, timeMs, ghost) => {
    set({ submitting: true });
    try {
      const r = await json<{
        improved: boolean;
        earned?: number;
        lucky?: boolean;
        daily?: number;
        coins?: number | null;
      }>(
        `/api/worlds/${encodeURIComponent(worldId)}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ timeMs: Math.round(timeMs), ghost }),
        }
      );
      set({
        submitting: false,
        earned: r.earned && r.earned > 0 ? r.earned : null,
        lucky: r.lucky === true,
        daily: r.daily && r.daily > 0 ? r.daily : null,
      });
      // The server paid today's bonus, which is the one fact the streak is
      // built on: it only ever pays once a day, so this is once a day too.
      if (r.daily && r.daily > 0) recordFinish(dayKey());
      // The balance moved, so anything showing it is now stale. Written
      // straight in rather than refetched: the server just told us the answer.
      if (typeof r.coins === "number") {
        const { useShop } = await import("./shop");
        useShop.setState({ coins: r.coins });
      }
      // Only refetch when the standings can have moved. Most runs are slower
      // than the runner's own best, and re-fetching for those would mean a
      // request per attempt on a map somebody is grinding. The weekly board
      // can move on a run the all-time one ignores — a slower-than-ever run
      // that is still this week's best — so it refetches on any finish.
      if ((r.improved || get().period === "week") && get().worldId === worldId) {
        await get().load(worldId);
      }
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
      ghostLoading: false,
      earned: null,
      lucky: false,
      daily: null,
    }),
}));

const PERIOD_KEY = "blockworld:board-period";

/** The board the player last chose. Per browser, like a best time. */
function readPeriod(): BoardPeriod {
  try {
    return localStorage.getItem(PERIOD_KEY) === "week" ? "week" : "all";
  } catch {
    return "all";
  }
}

function writePeriod(period: BoardPeriod) {
  try {
    localStorage.setItem(PERIOD_KEY, period);
  } catch {
    /* the choice lasts the session */
  }
}
