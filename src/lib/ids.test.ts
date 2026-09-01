import test from "node:test";
import assert from "node:assert/strict";
import { isUuid } from "./ids";
import { BUILT_IN_WORLDS } from "./built-in-worlds";

/**
 * These guard a real 500: `worlds.id` is a Postgres uuid column, so every
 * route that looked a world up by a raw path segment crashed on any id that
 * was not uuid-shaped instead of answering 404.
 */

test("accepts a generated uuid", () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(isUuid(crypto.randomUUID()), true);
  }
});

test("rejects the shapes that used to reach Postgres", () => {
  for (const bad of [
    "",
    "not-a-uuid",
    "zzz",
    "../../etc/passwd",
    "11111111-1111-1111-1111-11111111111", // one char short
    "11111111-1111-1111-1111-1111111111111", // one char long
    "gggggggg-1111-1111-1111-111111111111", // not hex
    "11111111111111111111111111111111", // no dashes
    " 11111111-1111-1111-1111-111111111111", // padded
  ]) {
    assert.equal(isUuid(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("built-in slugs are not uuids, so they must be checked first", () => {
  for (const w of BUILT_IN_WORLDS) {
    assert.equal(isUuid(w.slug), false);
  }
});
