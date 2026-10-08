import test from "node:test";
import assert from "node:assert/strict";
import { ARCADE } from "@/arcade/registry";
import { PARTY_GAMES, guestName, isPlayablePartyGame, rankScores } from "./party-games";

/**
 * `PARTY_GAMES` is a copy of part of the arcade registry that the party's rules
 * can read without importing every cabinet. A copy drifts, so this holds it.
 */

test("every party game is a cabinet the arcade ships", () => {
  const ids = new Set(ARCADE.filter((e) => !e.dev).map((e) => e.id));
  for (const g of PARTY_GAMES) assert.ok(ids.has(g.id), `${g.id} is not in the arcade registry`);
});

test("every shipped cabinet is in the party list, ready or not", () => {
  // A new cabinet that is not here is a game a party cannot see at all,
  // rather than one it can see is coming.
  const listed = new Set(PARTY_GAMES.map((g) => g.id));
  for (const e of ARCADE) if (!e.dev) assert.ok(listed.has(e.id), `${e.id} is missing from PARTY_GAMES`);
});

test("score games are runners, and board games are seats", () => {
  const board = new Set(ARCADE.filter((e) => e.board).map((e) => e.id));
  for (const g of PARTY_GAMES) {
    if (g.kind === "score") assert.ok(!board.has(g.id), `${g.id} reports a placement, not a score`);
  }
});

test("only a ready game is playable", () => {
  for (const g of PARTY_GAMES) assert.equal(isPlayablePartyGame(g.id), g.ready);
  assert.equal(isPlayablePartyGame("nope"), false);
});

test("guest names are words from the list, and the first hundred are all different", () => {
  const names = new Set(Array.from({ length: 100 }, (_, i) => guestName(i)));
  assert.equal(names.size, 100);
  for (const n of names) assert.match(n, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

test("ranking shares places on a tie and breaks order by join order", () => {
  const ranked = rankScores([
    { score: 5, order: 2 },
    { score: 9, order: 0 },
    { score: 5, order: 1 },
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.row.score, r.row.order, r.place]),
    [
      [9, 0, 1],
      [5, 1, 2],
      [5, 2, 2],
    ]
  );
});
