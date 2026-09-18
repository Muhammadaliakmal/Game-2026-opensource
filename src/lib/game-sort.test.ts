import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SORT,
  filterByTags,
  parseSort,
  parseTags,
  sortEntries,
  viewQuery,
} from "./game-sort";
import { byKind, filterTagsFor, type GameEntry } from "@/content/registry";

/**
 * The arcade grid's sort and filter.
 *
 * Twelve cabinets is past the point where a flat grid works, and these are the
 * controls that answer it. Two behaviours here are decisions rather than
 * mechanics, and both are the sort that regress silently: what "Popular" does
 * before anybody has played anything, and what a bad URL parameter does.
 */

const entry = (
  slug: string,
  title: string,
  addedAt: string,
  tags: GameEntry["tags"] = ["Solo"]
): GameEntry => ({
  slug,
  kind: "arcade",
  title,
  tagline: "",
  href: `/arcade?play=${slug}`,
  tags,
  addedAt,
});

const GRID: GameEntry[] = [
  entry("alpha", "Alpha", "2026-09-01"),
  entry("bravo", "Bravo", "2026-09-17"),
  entry("charlie", "Charlie", "2026-09-08", ["Solo", "Puzzle"]),
];

test("an unreadable sort falls back rather than emptying the grid", () => {
  assert.equal(parseSort("newest"), "newest");
  assert.equal(parseSort("nonsense"), DEFAULT_SORT);
  assert.equal(parseSort(undefined), DEFAULT_SORT);
  assert.equal(parseSort(null), DEFAULT_SORT);
  assert.equal(parseSort(7), DEFAULT_SORT);
});

test("tags that are not offered are dropped, not kept and then matched", () => {
  // Kept, an unknown tag filters the grid to nothing and leaves a selected
  // chip the player cannot see to unselect.
  const offered = filterTagsFor(byKind("arcade"));
  assert.deepEqual(parseTags("", offered), []);
  assert.deepEqual(parseTags(undefined, offered), []);
  assert.deepEqual(parseTags("Nonsense", offered), []);
  assert.deepEqual(parseTags("Solo,Nonsense", offered), ["Solo"]);
});

test("two chips narrow the list, they do not widen it", () => {
  // AND, not OR. Pressing a second chip and getting MORE cards is the
  // opposite of what a filter appears to promise.
  assert.equal(filterByTags(GRID, []).length, 3);
  assert.equal(filterByTags(GRID, ["Solo"]).length, 3);
  assert.equal(filterByTags(GRID, ["Puzzle"]).length, 1);
  assert.equal(filterByTags(GRID, ["Solo", "Puzzle"]).length, 1);
});

test("A–Z is alphabetical by what the card actually says", () => {
  const order = sortEntries(GRID, "az").map((e) => e.slug);
  assert.deepEqual(order, ["alpha", "bravo", "charlie"]);
});

test("Newest is newest first", () => {
  const order = sortEntries(GRID, "newest").map((e) => e.slug);
  assert.deepEqual(order, ["bravo", "charlie", "alpha"]);
});

test("Popular with no plays yet falls back to newest, not to nothing", () => {
  // The decision this file exists for. On a fresh deployment, while the stats
  // request is in flight, and forever if the counters are down, `plays` is
  // empty — and a default sort that silently becomes "whatever order the
  // registry happens to be in" is a control that appears to do nothing.
  const order = sortEntries(GRID, "popular", {}).map((e) => e.slug);
  assert.deepEqual(order, ["bravo", "charlie", "alpha"]);
});

test("Popular ranks by plays once there are some", () => {
  const order = sortEntries(GRID, "popular", { alpha: 900, charlie: 20 }).map(
    (e) => e.slug
  );
  assert.deepEqual(order, ["alpha", "charlie", "bravo"]);
});

test("the order is total, so two renders of the same data match", () => {
  // Without a final tiebreak, cards swap places when the stats arrive and
  // change nothing about their relative order.
  const tied = [
    entry("one", "Same", "2026-09-01"),
    entry("two", "Same", "2026-09-01"),
  ];
  for (const sort of ["popular", "newest", "az"] as const) {
    const a = sortEntries(tied, sort).map((e) => e.slug);
    const b = sortEntries([...tied].reverse(), sort).map((e) => e.slug);
    assert.deepEqual(a, b, `${sort} is not stable`);
  }
});

test("sorting never mutates what it was handed", () => {
  const before = GRID.map((e) => e.slug);
  sortEntries(GRID, "az");
  filterByTags(GRID, ["Puzzle"]);
  assert.deepEqual(
    GRID.map((e) => e.slug),
    before
  );
});

test("the default view is a bare path, with no parameters on it", () => {
  // `?play=<slug>` deep links to the arcade are indexed. A second parameter
  // set appearing on every internal link would compete with them.
  assert.equal(viewQuery(DEFAULT_SORT, []), "");
  assert.equal(viewQuery("newest", []), "?sort=newest");
  assert.equal(viewQuery(DEFAULT_SORT, ["Solo", "Puzzle"]), "?tags=Solo%2CPuzzle");
  assert.equal(viewQuery("az", ["Solo"]), "?sort=az&tags=Solo");
});

test("a view round-trips through its own query string", () => {
  const offered = filterTagsFor(byKind("arcade"));
  const tags = offered.slice(0, 2);
  const query = new URLSearchParams(viewQuery("newest", tags).replace(/^\?/, ""));
  assert.equal(parseSort(query.get("sort")), "newest");
  assert.deepEqual(parseTags(query.get("tags"), offered), tags);
});
