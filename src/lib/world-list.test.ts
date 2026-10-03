import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_WORLDS, LISTED_WORLDS, PARKOUR_COURSES } from "./built-in-worlds";
import { LISTED_META, PARKOUR_META, WORLD_META } from "./world-list";
import { dailyPick } from "./daily";

const meta = (w: { slug: string; name: string; blurb: string; tier?: string }) => ({
  slug: w.slug,
  name: w.name,
  blurb: w.blurb,
  ...(w.tier ? { tier: w.tier } : {}),
});

test("WORLD_META is BUILT_IN_WORLDS without the builders, in the same order", () => {
  assert.deepEqual(WORLD_META.map(meta), BUILT_IN_WORLDS.map(meta));
});

test("the listed and parkour filters agree with built-in-worlds", () => {
  assert.deepEqual(LISTED_META.map((w) => w.slug), LISTED_WORLDS.map((w) => w.slug));
  assert.deepEqual(PARKOUR_META.map((w) => w.slug), PARKOUR_COURSES.map((w) => w.slug));
});

test("the daily challenge picks the same course from either list", () => {
  // A year of days: the client card and the runs route must never disagree.
  for (let d = 0; d < 366; d++) {
    const now = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000);
    assert.equal(dailyPick(PARKOUR_META, now)?.slug, dailyPick(PARKOUR_COURSES, now)?.slug);
  }
});
