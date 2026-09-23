import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  REGISTRY,
  CABINET_COUNT,
  COURSE_COUNT,
  WORLD_COUNT,
  TAGS_IN_USE,
  filterTagsFor,
  bySlug,
  byKind,
  isKnownSlug,
  isNew,
  inNewestCohort,
  NEWEST_DATES,
} from "./registry";
import { CABINETS } from "@/arcade/registry";
import { PARKOUR_COURSES, SANDBOX_WORLDS } from "@/lib/built-in-worlds";
import { RACE } from "@/lib/features";

/**
 * The registry is a hand-written copy of three other lists, and this file is
 * the entire reason that is allowed.
 *
 * `registry.ts` imports nothing, so a stats route can validate a slug without
 * pulling twenty-one course builders into the bundle. The cost of that is a
 * list that could fall out of step with the registries it mirrors. These
 * assertions make that a failing suite rather than a card that quietly stops
 * appearing — and they name the missing slug, so the fix is one line.
 */

test("every cabinet is in the registry, with its own title and tagline", () => {
  for (const c of CABINETS) {
    const entry = bySlug.get(c.id);
    assert.ok(entry, `cabinet "${c.id}" is missing from src/content/registry.ts`);
    assert.equal(entry.kind, "arcade");
    assert.equal(entry.title, c.title, `title drifted for "${c.id}"`);
    assert.equal(entry.tagline, c.tagline, `tagline drifted for "${c.id}"`);
    assert.equal(entry.href, `/arcade?play=${c.id}`);
  }
});

test("every parkour course is in the registry", () => {
  for (const w of PARKOUR_COURSES) {
    const entry = bySlug.get(w.slug);
    assert.ok(entry, `course "${w.slug}" is missing from src/content/registry.ts`);
    assert.equal(entry.kind, "course");
    assert.equal(entry.title, w.name, `title drifted for "${w.slug}"`);
    assert.equal(entry.href, `/play/${w.slug}`);
    assert.equal(entry.parent, "parkour-mode");
  }
});

test("every sandbox world is in the registry", () => {
  for (const w of SANDBOX_WORLDS) {
    const entry = bySlug.get(w.slug);
    assert.ok(entry, `world "${w.slug}" is missing from src/content/registry.ts`);
    assert.equal(entry.kind, "world");
    assert.equal(entry.title, w.name, `title drifted for "${w.slug}"`);
  }
});

test("the registry holds nothing the game does not ship", () => {
  // The other direction. A slug left behind after content is deleted is a
  // card linking to a 404 and a stats row nothing will ever read.
  const shipped = new Set<string>([
    "parkour-mode",
    ...(RACE ? ["race-mode"] : []),
    ...CABINETS.map((c) => c.id),
    ...PARKOUR_COURSES.map((w) => w.slug),
    ...SANDBOX_WORLDS.map((w) => w.slug),
  ]);
  for (const entry of REGISTRY) {
    assert.ok(
      shipped.has(entry.slug),
      `"${entry.slug}" is in the registry but the game does not ship it`
    );
  }
  assert.equal(REGISTRY.length, shipped.size);
});

test("the counts the copy quotes are the counts the game ships", () => {
  /*
   * These numbers are interpolated into the About page, the root meta
   * description, the home headline and two page descriptions. Every one of
   * those sentences previously had the number typed into it, and every one of
   * them was wrong — About said five courses when twenty-one shipped, and
   * `/parkour` said twenty in its description while the paragraph below it
   * said twenty-one on the same screen.
   */
  assert.equal(COURSE_COUNT, PARKOUR_COURSES.length);
  assert.equal(CABINET_COUNT, CABINETS.length);
  assert.equal(WORLD_COUNT, SANDBOX_WORLDS.length);
  // And they are not zero, which is the shape a broken derivation takes.
  assert.ok(COURSE_COUNT > 0 && CABINET_COUNT > 0 && WORLD_COUNT > 0);
});

test("slugs are unique across every kind", () => {
  /*
   * The one that will actually bite. `bySlug` is a flat Map, so a second entry
   * with an existing slug does not error — it silently replaces the first, and
   * the two share a row of plays and likes.
   *
   * There are live candidates: the v2 spec proposes a race track called
   * `spiral` and an expert course called `gauntlet`, and both names are
   * already taken by courses that shipped on 7 September. Whichever wins the
   * name, this test is what says so out loud.
   */
  const seen = new Map<string, string>();
  for (const e of REGISTRY) {
    const prior = seen.get(e.slug);
    assert.equal(
      prior,
      undefined,
      `slug "${e.slug}" is used by both the ${prior} and the ${e.kind}`
    );
    seen.set(e.slug, e.kind);
  }
  assert.equal(seen.size, REGISTRY.length);
});

test("slugs are URL-safe and stable-looking", () => {
  for (const e of REGISTRY) {
    assert.match(
      e.slug,
      /^[a-z0-9-]+$/,
      `"${e.slug}" is not a lowercase kebab-case slug`
    );
  }
});

test("every cover a card points at is a file that exists", () => {
  // The alternative is a broken image on a card, which reserves its space
  // (see the aspect-ratio rule) and then shows nothing in it.
  for (const e of REGISTRY) {
    if (!e.thumb) continue;
    const file = join(process.cwd(), "public", e.thumb.replace(/^\//, ""));
    assert.ok(existsSync(file), `${e.slug} points at a missing cover: ${e.thumb}`);
  }
});

test("every cabinet draws its own art rather than naming a file", () => {
  for (const e of byKind("arcade")) {
    assert.equal(e.thumb, undefined, `${e.slug} should have no thumb — see CabinetPreview`);
  }
});

test("addedAt is a real ISO date on every row", () => {
  for (const e of REGISTRY) {
    assert.match(e.addedAt, /^\d{4}-\d{2}-\d{2}$/, `${e.slug} has a malformed addedAt`);
    assert.ok(!Number.isNaN(Date.parse(e.addedAt)), `${e.slug} has an unparseable addedAt`);
  }
});

test("every entry carries at least one tag, and only tags in the vocabulary", () => {
  for (const e of REGISTRY) {
    assert.ok(e.tags.length > 0, `${e.slug} has no tags, so no filter can reach it`);
    for (const t of e.tags) {
      assert.ok(TAGS_IN_USE.includes(t), `${e.slug} carries an unused tag "${t}"`);
    }
  }
});

test("a tag chip that would leave a single card is never offered", () => {
  // The rule the vocabulary is closed for: a chip has to narrow the list to
  // something worth looking at. "Multiplayer" is on one row since the arena
  // was cut, so it must be readable on the race card and absent from the
  // chips — which is the distinction `filterTagsFor` exists to draw.
  for (const t of filterTagsFor(REGISTRY)) {
    const n = REGISTRY.filter((e) => e.tags.includes(t)).length;
    assert.ok(n >= 2, `tag "${t}" is on ${n} entries — too few to be a filter`);
  }
  if (RACE) {
    assert.ok(TAGS_IN_USE.includes("Multiplayer"), "Multiplayer should still be readable");
  }
  assert.ok(
    !filterTagsFor(REGISTRY).includes("Multiplayer"),
    "Multiplayer is on one row and must not be a chip"
  );
});

test("chips are computed against the cards in front of the player", () => {
  // The arcade grid's chips come from the cabinets, not from the whole site:
  // "Medals" filters twenty-one courses and no cabinet, and offering it above
  // eight cabinets would empty the grid.
  const cabinets = byKind("arcade");
  const chips = filterTagsFor(cabinets);
  assert.ok(chips.length > 0, "the arcade grid has no chips at all");
  for (const t of chips) {
    assert.ok(
      cabinets.filter((e) => e.tags.includes(t)).length >= 2,
      `"${t}" is not on two cabinets`
    );
  }
  assert.ok(!chips.includes("Medals"), "Medals is not an arcade filter");
  assert.ok(!chips.includes("Ghosts"), "Ghosts is not an arcade filter");
});

test("isKnownSlug rejects everything that is not a shipped slug", () => {
  assert.equal(isKnownSlug("swarm"), true);
  assert.equal(isKnownSlug("not-a-game"), false);
  assert.equal(isKnownSlug(""), false);
  assert.equal(isKnownSlug(null), false);
  assert.equal(isKnownSlug(42), false);
  // The shape a key-space attack takes: a slug-looking string nobody ships.
  assert.equal(isKnownSlug("plays:*"), false);
});

test("the New pill expires fourteen days after the date on the row", () => {
  // A date from the newest cohort, not a literal one: the cohort moves every
  // time something ships, and a hard-coded date fell out of it the day the
  // duel cabinet landed.
  const date = NEWEST_DATES[0];
  const entry = { ...REGISTRY[0], addedAt: date };
  const day = 24 * 60 * 60 * 1000;
  assert.equal(isNew(entry, Date.parse(date) + day), true);
  assert.equal(isNew(entry, Date.parse(date) + 13 * day), true);
  assert.equal(isNew(entry, Date.parse(date) + 15 * day), false);
});

test("the New pill is not on most of the catalogue", () => {
  /*
   * The failure this exists for is not a wrong date, it is a correct one.
   *
   * Every course here shipped inside eighteen days, so the spec's fourteen-day
   * window put a pill on eighteen of twenty-three cards on the day it landed —
   * technically right, and a badge on eighty per cent of a list is not a badge.
   * `inNewestCohort` is the second condition, and this is the assertion that
   * says what it is for.
   */
  const flagged = REGISTRY.filter(inNewestCohort);
  assert.ok(flagged.length > 0, "nothing is ever new, so the pill is dead code");
  assert.ok(
    flagged.length <= Math.ceil(REGISTRY.length / 4),
    `${flagged.length} of ${REGISTRY.length} entries are in the newest cohort — ` +
      `a pill on that many cards says nothing`
  );
});

test("the newest cohort really is the newest", () => {
  const cutoff = NEWEST_DATES[NEWEST_DATES.length - 1];
  for (const e of REGISTRY) {
    if (inNewestCohort(e)) {
      assert.ok(e.addedAt >= cutoff, `${e.slug} is in the cohort but older than it`);
    } else {
      assert.ok(e.addedAt < cutoff, `${e.slug} is as new as the cohort but outside it`);
    }
  }
});

test("both halves of New are required", () => {
  const newest = REGISTRY.find(inNewestCohort)!;
  const old = REGISTRY.find((e) => !inNewestCohort(e))!;
  const justAfter = Date.parse(newest.addedAt) + 24 * 60 * 60 * 1000;
  const longAfter = Date.parse(newest.addedAt) + 40 * 24 * 60 * 60 * 1000;

  assert.equal(isNew(newest, justAfter), true, "in the cohort and in the window");
  assert.equal(isNew(newest, longAfter), false, "in the cohort, past the window");
  // The one the cohort rule adds: recent on the clock, but not the latest batch.
  assert.equal(
    isNew(old, Date.parse(old.addedAt) + 1000),
    false,
    "one second old and still not in the newest cohort"
  );
});
