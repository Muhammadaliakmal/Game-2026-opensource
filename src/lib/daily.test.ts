import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_BONUS, dailyPick, dayEndsAt, dayKey, weekKey } from "./daily";
import { valueOf } from "./coins";

const at = (iso: string) => new Date(iso);

test("the day key is the UTC date, whatever the local zone", () => {
  // 23:30 UTC on the 14th is already the 15th in half the world; the key
  // must say the 14th, because the hub and the route both read UTC.
  assert.equal(dayKey(at("2026-09-14T23:30:00Z")), "2026-09-14");
  assert.equal(dayKey(at("2026-09-15T00:00:00Z")), "2026-09-15");
});

test("the week key is the ISO week", () => {
  // Known answers: 2026-01-01 is a Thursday, so it is in week 1 of 2026;
  // 2024-12-30 is a Monday and belongs to 2025's week 1.
  assert.equal(weekKey(at("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(weekKey(at("2024-12-30T12:00:00Z")), "2025-W01");
  assert.equal(weekKey(at("2024-12-29T12:00:00Z")), "2024-W52");
  // Monday and the following Sunday share a week; the next Monday does not.
  assert.equal(weekKey(at("2026-09-14T00:00:00Z")), weekKey(at("2026-09-20T23:59:59Z")));
  assert.notEqual(weekKey(at("2026-09-20T23:59:59Z")), weekKey(at("2026-09-21T00:00:00Z")));
});

test("the day ends at the next UTC midnight", () => {
  assert.equal(dayEndsAt(at("2026-09-14T23:30:00Z")).toISOString(), "2026-09-15T00:00:00.000Z");
});

test("the daily pick is stable within a day and moves between days", () => {
  const ladder = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const morning = dailyPick(ladder, at("2026-09-14T01:00:00Z"));
  const night = dailyPick(ladder, at("2026-09-14T23:59:00Z"));
  assert.equal(morning, night, "the same course all day");

  // Not literally every day — a hash may repeat — but over a month the
  // ladder must be visited widely, or it is a rotation with extra steps.
  const seen = new Set<string>();
  for (let d = 1; d <= 30; d++) {
    seen.add(dailyPick(ladder, at(`2026-09-${String(d).padStart(2, "0")}T12:00:00Z`))!);
  }
  assert.ok(seen.size >= ladder.length - 2, `only ${seen.size} of ${ladder.length} picked in a month`);
});

test("an empty ladder has no challenge", () => {
  assert.equal(dailyPick([], at("2026-09-14T12:00:00Z")), null);
});

test("the bonus is worth less than a Gold on the course itself", () => {
  // The challenge is a reason to open the game today, not a reason to skip
  // the ladder — see the constant's comment.
  assert.ok(DAILY_BONUS > 0);
  assert.ok(DAILY_BONUS < valueOf("gold"));
});
