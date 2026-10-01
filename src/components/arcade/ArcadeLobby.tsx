"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CABINETS, entryFor } from "@/arcade/registry";
import { byKind, filterTagsFor, type GameTag } from "@/content/registry";
import {
  filterByTags,
  parseSort,
  parseTags,
  sortEntries,
  viewQuery,
  type Sort,
} from "@/lib/game-sort";
import { useStats } from "@/components/stats/StatsProvider";
import { EmptyGrid, GridControls } from "./GridControls";
import { RememberPlay } from "@/components/RememberPlay";
import { useArcade } from "@/arcade/store";
import { RATES } from "@/lib/arcade-payout";
import { ControlsHint } from "@/components/hud/Hotkey";
import { StatBadge } from "@/components/stats/StatBadge";
import { CabinetPreview } from "./CabinetPreview";
import { warmCabinets } from "@/arcade/host/warm";

/**
 * The row of cabinets, and the thing that opens one.
 *
 * ── Why the arcade has a page at all ─────────────────────────────────────
 *
 * The spec puts the cabinets in a room in the 3D world and is right that a
 * reward which never leaves the minigame makes the minigame a separate app.
 * But this codebase has many worlds rather than one, and every other mode here
 * — parkour, race, the shop — already has a page of its own that says what it
 * is before you are standing in it. A cabinet in the world is the *place* you
 * play; this is the sign on the door, and it is also the only honest way to
 * reach a game before deciding which world to walk into.
 *
 * The two are the same games and the same store: opening one from here and
 * opening one from a cabinet are the same call.
 */
const ArcadeOverlay = dynamic(() => import("@/arcade/host/ArcadeOverlay"), {
  ssr: false,
});

/**
 * The cabinets in the order and the subset the URL asks for.
 *
 * ── Why the view lives in the query string ───────────────────────────────
 *
 * So a filtered grid is a link. "The puzzle cabinets" is worth sending to
 * somebody; a filter in React state is not sendable, not bookmarkable, and is
 * gone the moment a player opens a cabinet and presses Back.
 *
 * `?play=<slug>` is untouched by any of this. Those URLs are indexed and
 * `<ArcadeAutoOpen>` still reads them; `viewQuery` only ever writes `sort` and
 * `tags`, and writes neither when they are at their defaults, so the plain
 * `/arcade` link stays plain.
 *
 * ── The ordering the server rendered, and the one the player gets ────────
 *
 * "Popular" needs play counts, which arrive one request after paint. With no
 * counts `sortEntries` falls back to newest-first — a real ordering rather
 * than none — so the grid is correct on first paint and re-orders once only,
 * and only if the counts actually disagree with it. The cards are equal-sized
 * cells in a fixed grid, so what moves is their contents rather than the
 * page's layout.
 */
function useCabinetGrid() {
  const router = useRouter();
  const params = useSearchParams();
  const ctx = useStats();

  // Chips computed from the cabinets, not from the whole site: "Medals" is on
  // twenty-one courses and no cabinet, and offering it here would empty the
  // grid. See `filterTagsFor`.
  const offered = useMemo(() => filterTagsFor(byKind("arcade")), []);

  const sort = parseSort(params.get("sort"));

  /*
   * The selected tags, canonicalised to a string first and parsed back out of
   * it.
   *
   * `parseTags` returns a fresh array every render, which is useless as a
   * dependency — and `react-hooks/use-memo` rejects the obvious workaround of
   * putting `tags.join(",")` in the dependency list, because a dependency has
   * to be something it can track rather than an expression it has to evaluate.
   * Normalising to the key and deriving the array from it inside the memo
   * gives both hooks a plain string to compare, and drops any unknown tag on
   * the way through exactly once.
   */
  const tagKey = parseTags(params.get("tags"), offered).join(",");
  const tags = useMemo(() => parseTags(tagKey, offered), [tagKey, offered]);

  const plays = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [slug, stat] of Object.entries(ctx?.stats ?? {})) {
      out[slug] = stat.plays;
    }
    return out;
  }, [ctx?.stats]);

  const shown = useMemo(
    () => sortEntries(filterByTags(byKind("arcade"), tags), sort, plays),
    [tags, sort, plays]
  );

  /**
   * Replace rather than push, and scroll nothing.
   *
   * Pressing four chips in a row should not put four entries in the history
   * for Back to walk out through — the way out of a filtered arcade is Clear,
   * or the header. `scroll: false` keeps the page where the player left it;
   * without it every chip press jumps them back to the top of the grid they
   * are reading.
   */
  const go = (nextSort: Sort, nextTags: readonly GameTag[]) => {
    router.replace(`/arcade${viewQuery(nextSort, nextTags)}`, { scroll: false });
  };

  return {
    sort,
    tags,
    offered,
    shown,
    total: CABINETS.length,
    setSort: (next: Sort) => go(next, tags),
    toggleTag: (tag: GameTag) =>
      go(sort, tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]),
    clear: () => go(sort, []),
  };
}

export function ArcadeLobby() {
  const open = useArcade((s) => s.open);
  const activeGame = useArcade((s) => s.activeGame);
  const best = useArcade((s) => s.best);
  const grid = useCabinetGrid();

  // Every cabinet's code into the offline cache while there is a connection.
  useEffect(() => warmCabinets(), []);

  /*
   * The cabinet registry, keyed, so the grid can iterate registry entries —
   * which carry the tags and the dates — while the cards still read their
   * hint, their rate and their preview from `arcade/registry`.
   */
  const cabinets = useMemo(() => new Map(CABINETS.map((c) => [c.id, c])), []);

  return (
    <>
      <GridControls
        sort={grid.sort}
        tags={grid.tags}
        offered={grid.offered}
        total={grid.total}
        showing={grid.shown.length}
        onSort={grid.setSort}
        onToggleTag={grid.toggleTag}
        onClear={grid.clear}
      />

      {grid.shown.length === 0 && <EmptyGrid onClear={grid.clear} />}

      <ul className="grid gap-4 sm:grid-cols-2">
        {grid.shown.map((row) => cabinets.get(row.slug)).filter((e) => e !== undefined).map((entry) => (
          <li key={entry.id}>
            {/*
              The tile is a container with a stretched button on it, not one
              big button.

              Same reason as the cards elsewhere, arrived at from the other
              direction: a <button> inside a <button> is invalid too, and this
              tile opens an overlay rather than navigating, so the thing being
              stretched is a button rather than a link. `.stretched-link` is
              named for the common case and works for either — it only spreads
              the hit area of whatever carries it.
            */}
            <div
              className="group card card-linked w-full overflow-hidden text-left"
              style={{ "--card-hue": entry.hue, "--card-hue-ink": "#0a0a0f" } as React.CSSProperties}
            >
              {/* The shelf display. It used to be an empty rectangle holding
                  two labels, which is what an arcade with nothing on its
                  shelves looks like. `CabinetPreview` draws the game's verb
                  from the same numbers the game is built from — see that file
                  for why it is generated rather than captured. The name is
                  set on it, title-screen style (`.art-title`). */}
              <div className="art-box relative aspect-[5/2] w-full overflow-hidden bg-[var(--art-backdrop,#0b1030)]">
                <CabinetPreview id={entry.id} />
                <h3
                  className="art-title art-title--fit absolute inset-x-4 bottom-2 truncate"
                  style={{ "--len": entry.title.length, "--fit-max": "1.5rem" } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => open(entry.id)}
                    className="stretched-link text-left"
                  >
                    {entry.title}
                  </button>
                </h3>
              </div>
              <div className="flex flex-col gap-1 p-4">
                {/* Rate and best, always both. The best reads an em dash
                    when unplayed: it used to appear only once there was a
                    score, so the first run on a cabinet silently changed the
                    card's layout — and a row of cards where one has a slot
                    the other does not reads as a rendering fault. */}
                <div className="flex items-center justify-between gap-3">
                  <span className="hud-label flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rotate-45"
                      style={{ background: entry.hue }}
                    />
                    {RATES[entry.id] ? `${RATES[entry.id]} coins per point` : "Practice"}
                  </span>
                  <span className="hud-label num">best {best[entry.id] ? best[entry.id] : "—"}</span>
                </div>
                <p className="text-dim text-sm">{entry.tagline}</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  {/* One input's instructions, not both. See components/hud/Hotkey. */}
                  <ControlsHint hint={entry.hint} className="hud-label block" />
                  <StatBadge slug={entry.id} />
                </div>
                {/* The tile is the control (the stretched button above); this
                    is the affordance that says so, as on the hub's cards. */}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="hud-chip hud-chip--primary w-fit">Play</span>
                  {/* The written half of this cabinet: what it is, how it
                      scores, and one thing to do differently. `card-actions`
                      because the title above is a stretched link and covers the
                      whole tile — the same reason the like button needs it.

                      It is also the only link a crawler has from here to a page
                      with words on it; the tile itself opens an overlay and
                      changes no URL it could follow. */}
                  <Link
                    href={`/games/${entry.id}`}
                    // Same reason as `<CourseCard>`: nine links whose visible
                    // text is identical are fine on screen and unusable in a
                    // screen reader's link list.
                    aria-label={`${entry.title} cabinet guide`}
                    className="card-actions hud-label text-dim hover:text-accent w-fit underline"
                  >
                    Cabinet guide &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {activeGame && <ArcadeOverlay />}
      {/* A cabinet is a game, so the front page can offer it back. Keyed on
          the open cabinet: it records once per opening, not per render. */}
      {activeGame && entryFor(activeGame) && (
        <RememberPlay
          href={`/arcade?play=${activeGame}`}
          title={entryFor(activeGame)!.title}
          kind="arcade"
          slug={activeGame}
        />
      )}
    </>
  );
}

/**
 * The shelf, before the grid has hydrated.
 *
 * Exactly the shape of the real thing: the same two-column grid, the same
 * card, the same 5:2 art box and the same three lines of text under it. That
 * is the whole job — if it is a different height, it is not a placeholder, it
 * is a second layout that the first one replaces.
 *
 * `aria-hidden`, because it says nothing. A screen reader hearing "loading"
 * eight times is worse than hearing the grid a moment later.
 */
export function ArcadeLobbySkeleton() {
  return (
    <div aria-hidden="true">
      {/* The controls row above the grid, which also has a height. */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="h-7" />
        <div className="h-7" />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {CABINETS.map((entry) => (
          <li key={entry.id}>
            <div className="card w-full overflow-hidden opacity-40">
              <div className="aspect-[5/2] w-full animate-pulse bg-[var(--art-backdrop,#0b1030)]" />
              <div className="flex flex-col gap-2 p-4">
                <div className="bg-surface h-4 w-1/2 rounded animate-pulse" />
                <div className="bg-surface h-3 w-3/4 rounded animate-pulse" />
                <div className="bg-surface mt-2 h-3 w-2/5 rounded animate-pulse" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
