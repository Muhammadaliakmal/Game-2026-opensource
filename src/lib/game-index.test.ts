import test from "node:test";
import assert from "node:assert/strict";
import { GAME_INDEX, searchIndex } from "./game-index";
import { CABINETS } from "@/arcade/registry";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import { escapeLike } from "@/app/api/worlds/search/route";

/**
 * The search box, pinned at the two places it can silently go wrong.
 *
 * The index is built from the registries the hub renders from, so the risk is
 * not that a name is misspelled — it is that the two lists drift, which is the
 * thing CLAUDE.md's "every game is in GamesHub and nowhere else" rule exists
 * to prevent. The other risk is the escape, which cannot be read.
 */

test("every game the site has is reachable from the search index", () => {
  // One entry per cabinet and per built-in world, plus the four modes. A game
  // added to a registry and not to the index is a game nobody can find.
  for (const c of CABINETS) {
    const hit = GAME_INDEX.find((e) => e.href === `/arcade?play=${c.id}`);
    assert.ok(hit, `cabinet ${c.id} is not in the search index`);
    assert.equal(hit.title, c.title);
  }
  for (const w of BUILT_IN_WORLDS) {
    const hit = GAME_INDEX.find((e) => e.href === `/play/${w.slug}`);
    assert.ok(hit, `world ${w.slug} is not in the search index`);
    assert.equal(hit.kind, w.tier ? "course" : "world");
  }
  for (const href of ["/parkour", "/race", "/arena", "/arcade"]) {
    assert.ok(
      GAME_INDEX.some((e) => e.href === href),
      `${href} is not in the search index`
    );
  }
});

test("every entry can be found by typing its own name", () => {
  for (const e of GAME_INDEX) {
    const rows = searchIndex(e.title);
    assert.ok(
      rows.some((r) => r.href === e.href),
      `"${e.title}" does not match itself`
    );
  }
});

test("an empty query matches nothing, rather than everything", () => {
  // The box is closed on an empty query; a list of every game would be the
  // hub it is sitting on top of.
  assert.deepEqual(searchIndex(""), []);
  assert.deepEqual(searchIndex("   "), []);
});

test("a name prefix outranks a term match", () => {
  // "race" is the Race mode's name and also a term on other entries.
  const rows = searchIndex("race");
  assert.equal(rows[0]?.href, "/race");
});

test("search is case- and whitespace-insensitive", () => {
  const plain = searchIndex("parkour").map((e) => e.href);
  assert.deepEqual(searchIndex("  PARKOUR  ").map((e) => e.href), plain);
});

test("a word somebody would type, but that is in no name, still finds the game", () => {
  // The whole point of `terms`: nothing is called "bikes" or "duel".
  assert.ok(searchIndex("bikes").some((e) => e.href === "/race"));
  assert.ok(searchIndex("duel").some((e) => e.href === "/arena"));
});

test("nonsense matches nothing", () => {
  assert.deepEqual(searchIndex("qzxvwk"), []);
});

test("a LIKE pattern escapes the wildcards as backslash pairs", () => {
  // The bug this replaces emitted the literal characters `${c}`.
  assert.equal(escapeLike("50%"), "50\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("plain"), "plain");
  assert.ok(!escapeLike("50%").includes("${c}"));
});

test("a LIKE pattern escapes the escape character itself", () => {
  // Postgres rejects a pattern ending in the escape character, so a trailing
  // backslash left alone is a 500 rather than an empty result.
  assert.equal(escapeLike("\\"), "\\\\");
  assert.equal(escapeLike("a\\"), "a\\\\");
  const pattern = `%${escapeLike("a\\")}%`;
  assert.ok(!/(^|[^\\])\\(\\\\)*$/.test(pattern.slice(0, -1)), "dangling escape");
});
