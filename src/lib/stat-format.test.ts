import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PLAYS_TO_SHOW,
  NO_COUNT,
  formatCount,
  formatLikes,
  formatPlays,
  likesLabel,
  playsLabel,
} from "./stat-format";

/**
 * What a card says about how many people played something.
 *
 * Small arithmetic, but it is on every card on the site and two of its rules
 * are product decisions rather than formatting: a count is never rounded up,
 * and a count under fifty is not shown at all.
 */

test("counts under a thousand are written out", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(999), "999");
});

test("a count is truncated, never rounded up", () => {
  // The rule that matters: 999 must not become "1.0k". A card claiming a
  // thousand plays it has not had is the one error this formatter can make
  // that a player could catch it in.
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1099), "1.0k");
  assert.equal(formatCount(1199), "1.1k");
  assert.equal(formatCount(999_999), "999k");
  assert.equal(formatCount(1_099_999), "1.0M");
});

test("the decimal is kept below ten and dropped above it", () => {
  assert.equal(formatCount(1200), "1.2k");
  assert.equal(formatCount(9900), "9.9k");
  assert.equal(formatCount(10_000), "10k");
  assert.equal(formatCount(43_800), "43k");
  assert.equal(formatCount(1_100_000), "1.1M");
  assert.equal(formatCount(2_500_000_000), "2.5B");
});

test("the spec's own examples come out as written", () => {
  assert.equal(formatCount(1200), "1.2k");
  assert.equal(formatCount(1_100_000), "1.1M");
});

test("nonsense in gives zero out rather than NaN on a card", () => {
  assert.equal(formatCount(NaN), "0");
  assert.equal(formatCount(-5), "0");
  assert.equal(formatCount(Infinity), "0");
});

test("a play count under the floor is an em dash", () => {
  assert.equal(formatPlays(0), NO_COUNT);
  assert.equal(formatPlays(3), NO_COUNT);
  assert.equal(formatPlays(MIN_PLAYS_TO_SHOW - 1), NO_COUNT);
  assert.equal(formatPlays(MIN_PLAYS_TO_SHOW), "50");
  assert.equal(formatPlays(undefined), NO_COUNT);
});

test("a like count has no floor, because one like is a real fact", () => {
  // Unlike plays: somebody chose to produce it. A dash beside a heart reads
  // as broken rather than as new.
  assert.equal(formatLikes(0), "0");
  assert.equal(formatLikes(1), "1");
  assert.equal(formatLikes(undefined), "0");
});

test("the spoken label is a sentence, not the abbreviation read out", () => {
  assert.equal(playsLabel(undefined), "Not enough plays yet");
  assert.equal(playsLabel(12), "Not enough plays yet");
  assert.equal(playsLabel(1200), "1,200 plays");
  assert.equal(playsLabel(50), "50 plays");
});

test("the heart says what pressing it will do", () => {
  assert.match(likesLabel(3, false), /Press to like/);
  assert.match(likesLabel(3, true), /press to undo/i);
  // Singular, because "1 likes" on a card is the kind of thing people notice.
  assert.match(likesLabel(1, false), /^1 like\./);
});
