"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Stat } from "@/lib/db/stats";

/**
 * One request for every badge on the page.
 *
 * ── The problem it exists for ────────────────────────────────────────────
 *
 * `<StatBadge>` is on every card, and the home page has around thirty. Thirty
 * components each fetching their own numbers is thirty requests, thirty
 * database round trips and — on a phone, over a slow link — thirty
 * connections competing with the images and the game bundle. The counts are
 * the least urgent thing on the screen and would be taking bandwidth from the
 * most urgent.
 *
 * So the badges register their slugs on mount, this collects them, and one
 * request goes out for all of them.
 *
 * ── Why registration is collected across a frame ─────────────────────────
 *
 * Thirty badges mount in the same commit, one after another. Firing on the
 * first registration would send a request for one slug and then twenty-nine
 * more as the rest arrived — the exact fan-out this is here to prevent. A
 * microtask is enough to let the whole commit finish: every badge in it has
 * registered by the time the queued callback runs, and the request that goes
 * out has all thirty slugs in it.
 *
 * A grid that pages in more cards later — the arcade's filters, a "load more"
 * — registers a second batch, which sends a second request containing only
 * what is new. `asked` is what makes it only what is new.
 *
 * ── Failure is indistinguishable from "nothing yet" ──────────────────────
 *
 * On purpose. A slug with no row has no entry in the response; a request that
 * failed has no entries at all; and a badge renders an em dash for both. The
 * definition-of-done item — "Redis down → site fully playable, counters render
 * —, zero thrown errors in console" — falls out of that rather than needing a
 * branch of its own.
 */

interface StatsContext {
  /** Counts known so far. Absent means "no number to show". */
  stats: Readonly<Record<string, Stat>>;
  /** Called by a badge on mount. Idempotent per slug. */
  register: (slug: string) => void;
  /** After a like lands, the server's count replaces the optimistic one. */
  setLikes: (slug: string, likes: number) => void;
}

const Ctx = createContext<StatsContext | null>(null);

/** The batch cap on the route. A page with more cards sends a second request. */
const MAX_SLUGS = 60;

export function StatsProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<Record<string, Stat>>({});

  // Slugs seen but not yet requested, and slugs already asked about. Refs
  // rather than state: registering must not re-render thirty cards, and these
  // are read by a queued callback rather than by the render that set them.
  const pending = useRef<Set<string>>(new Set());
  const asked = useRef<Set<string>>(new Set());
  const queued = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      // The fetch below resolves after an unmount when somebody navigates
      // during it. Writing state then is the classic React warning and, worse,
      // a leak of the whole subtree.
      alive.current = false;
    };
  }, []);

  /**
   * Drain the queue, one request per batch, until it is empty.
   *
   * A loop rather than a function that re-queues itself at the end. The
   * recursive version reads more naturally and is not allowed here — the
   * repo's `react-hooks/immutability` rule rejects a `useCallback` that names
   * itself, because the reference captured inside the closure is the one from
   * the render that created it and can go stale. Draining in a `while` has no
   * self-reference to go stale, and it handles the two cases that produce a
   * second batch identically: slugs left over past the sixty-slug cap, and
   * cards that mounted while the first request was in flight.
   *
   * `queued` stays true for the whole drain rather than being cleared at the
   * top, so a registration arriving mid-request adds to the queue this loop is
   * already working through instead of starting a second one beside it.
   */
  const flush = useCallback(async () => {
    while (pending.current.size > 0) {
      const batch = [...pending.current].slice(0, MAX_SLUGS);
      pending.current = new Set([...pending.current].slice(MAX_SLUGS));
      for (const s of batch) asked.current.add(s);

      try {
        const query = batch.map(encodeURIComponent).join(",");
        const res = await fetch(`/api/stats?slugs=${query}`);
        if (res.ok) {
          const data = (await res.json()) as Record<string, Stat>;
          if (!alive.current) break;
          setStats((prev) => ({ ...prev, ...data }));
        }
      } catch {
        /* See the note above: no counts and failed counts render identically. */
      }
    }
    queued.current = false;
  }, []);

  const register = useCallback(
    (slug: string) => {
      if (asked.current.has(slug) || pending.current.has(slug)) return;
      pending.current.add(slug);
      if (queued.current) return;
      queued.current = true;
      // A microtask, so every badge in this commit has registered before the
      // request is built. See the note at the top of the file.
      queueMicrotask(() => void flush());
    },
    [flush]
  );

  const setLikes = useCallback((slug: string, likes: number) => {
    setStats((prev) => ({
      ...prev,
      [slug]: { plays: prev[slug]?.plays ?? 0, likes },
    }));
  }, []);

  const value = useMemo(
    () => ({ stats, register, setLikes }),
    [stats, register, setLikes]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The badge's view of the provider.
 *
 * Returns null outside one rather than throwing. A card is used on pages that
 * have no provider above them — a preview, a test harness, a page that renders
 * one card in isolation — and a badge that throws would take the whole page
 * down over a number it was going to render as an em dash anyway.
 */
export function useStats(): StatsContext | null {
  return useContext(Ctx);
}
