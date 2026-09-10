import test from "node:test";
import assert from "node:assert/strict";
import { shouldPrefetch } from "./prefetch";

/**
 * The guard on a megabyte of speculative download.
 *
 * Small enough to look obviously right and easy to get exactly backwards: the
 * two mistakes available here are refusing to prefetch on the browsers that
 * report nothing — which is Safari, and therefore most phones — and prefetching
 * anyway when somebody has explicitly asked their browser to save data.
 * Neither shows up in development, because development is a fast laptop with
 * Data Saver off.
 */

test("no information means yes", () => {
  // Safari and Firefox implement no `navigator.connection` at all. Reading
  // that as "assume a slow connection" would switch the optimisation off for
  // the browsers most likely to need it, which is the opposite of the point.
  assert.equal(shouldPrefetch(), true);
  assert.equal(shouldPrefetch(null), true);
  assert.equal(shouldPrefetch({}), true);
});

test("Data Saver is an instruction, not a hint", () => {
  assert.equal(shouldPrefetch({ saveData: true }), false);
  // It wins even on a connection fast enough to afford it: the setting is the
  // visitor saying no, and speed is not the reason they said it.
  assert.equal(shouldPrefetch({ saveData: true, effectiveType: "4g" }), false);
});

test("4g prefetches; anything slower does not", () => {
  assert.equal(shouldPrefetch({ effectiveType: "4g" }), true);
  for (const effectiveType of ["3g", "2g", "slow-2g"]) {
    assert.equal(
      shouldPrefetch({ effectiveType }),
      false,
      `${effectiveType} should not spend a megabyte speculatively`
    );
  }
});

test("an effectiveType nobody has heard of is treated as slow", () => {
  // Deliberately not an allowlist inverted: if the spec grows a "5g", this
  // returning false is a missed optimisation, whereas defaulting unknown
  // strings to true would prefetch on whatever "2g-lite" turns out to mean.
  assert.equal(shouldPrefetch({ effectiveType: "5g" }), false);
});
