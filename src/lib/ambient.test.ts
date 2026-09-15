import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_WORLDS } from "./built-in-worlds";
import { moodFor } from "./ambient";

test("every shipped world has the bed its dressing implies", () => {
  // The moods follow the surface dressing: the two race tracks and every
  // ladder course are neon, the island is outdoors, the cottage is indoors.
  // A change to which worlds ship lands here, so a new course cannot arrive
  // silent by default.
  for (const w of BUILT_IN_WORLDS) {
    const mood = moodFor(w.slug);
    if (w.tier || w.slug === "circuit" || w.slug === "ridge") {
      assert.equal(mood, "neon", w.slug);
    } else if (w.slug === "cottage") {
      assert.equal(mood, "cozy");
    } else {
      assert.equal(mood, "natural", w.slug);
    }
  }
});

test("a world somebody built is outdoors", () => {
  assert.equal(moodFor("4d3f2a10-0000-4000-8000-000000000000"), "natural");
});
