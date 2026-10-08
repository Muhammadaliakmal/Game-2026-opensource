import test from "node:test";
import assert from "node:assert/strict";
import { Party, ROUND_LIMIT_MS } from "./party";
import { PARTY_MAX } from "./party-games";

/**
 * The parts of a party that go wrong without throwing: a host who leaves and
 * strands everyone, a round that never ends because somebody walked away, and
 * a spectator counted in standings for a round they never played.
 */

let seeds = 0;
const fresh = () => new Party(() => ++seeds);

function lobby(n = 3) {
  const p = fresh();
  for (let i = 0; i < n; i++) p.join(`m${i}`, `M${i}`);
  return p;
}

function playing(n = 3) {
  const p = lobby(n);
  assert.ok(p.pick("m0", "chunk-runner"));
  assert.ok(p.start("m0", 0));
  return p;
}

test("the first to join hosts", () => {
  const p = lobby();
  assert.equal(p.hostId, "m0");
});

test("only the host picks and starts", () => {
  const p = lobby();
  assert.equal(p.pick("m1", "chunk-runner"), false);
  assert.ok(p.pick("m0", "chunk-runner"));
  assert.equal(p.start("m1", 0), false);
  assert.ok(p.start("m0", 0));
  assert.equal(p.phase, "playing");
});

test("a table game seats the first to arrive, and the rest watch", () => {
  const p = lobby(6);
  assert.ok(p.pick("m0", "ludo"));
  assert.ok(p.start("m0", 0));
  assert.deepEqual(p.seats, ["m0", "m1", "m2", "m3"]);
  assert.equal(p.members.get("m4")!.playing, false);
  for (const id of p.seats) p.finish(id, 1);
  assert.equal(p.phase, "results", "the watchers are not waited for");
});

test("a score game seats nobody: everyone plays their own copy", () => {
  const p = playing(3);
  assert.deepEqual(p.seats, []);
  assert.ok([...p.members.values()].every((m) => m.playing));
});

test("a game that is not ready cannot be picked", () => {
  const p = lobby();
  assert.equal(p.pick("m0", "no-such-cabinet"), false);
  assert.equal(p.game, "");
  assert.equal(p.start("m0", 0), false, "nothing picked, nothing to start");
});

test("the host leaving hands the party to the longest-standing member", () => {
  const p = lobby(3);
  p.leave("m0");
  assert.equal(p.hostId, "m1");
  p.join("late", "Late");
  p.leave("m1");
  assert.equal(p.hostId, "m2", "join order, not map order");
});

test("every round gets a fresh seed and a new round number", () => {
  const p = playing();
  const first = p.seed;
  for (const id of ["m0", "m1", "m2"]) p.finish(id, 1);
  assert.equal(p.phase, "results");
  assert.ok(p.start("m0", 1), "rematch from results");
  assert.notEqual(p.seed, first);
  assert.equal(p.round, 2);
});

test("the round ends when everyone playing is done", () => {
  const p = playing(3);
  assert.equal(p.finish("m0", 10), false);
  assert.equal(p.finish("m1", 30), false);
  assert.equal(p.finish("m2", 20), true);
  assert.equal(p.phase, "results");
  assert.deepEqual(
    p.standings().map((s) => [s.name, s.place]),
    [["M1", 1], ["M2", 2], ["M0", 3]]
  );
});

test("leaving mid-round can be what ends it", () => {
  const p = playing(2);
  p.finish("m0", 5);
  assert.equal(p.leave("m1"), true);
  assert.equal(p.phase, "results");
});

test("someone arriving mid-round watches it, and plays the next", () => {
  const p = playing(2);
  p.join("late", "Late");
  assert.equal(p.score("late", 99), false);
  p.finish("m0", 1);
  p.finish("m1", 2);
  assert.equal(p.phase, "results", "the spectator is not waited for");
  assert.ok(!p.standings().some((s) => s.id === "late"));
  p.start("m0", 1);
  assert.ok(p.score("late", 3), "next round they are in");
});

test("ties share a place", () => {
  const p = playing(3);
  p.finish("m0", 50);
  p.finish("m1", 50);
  p.finish("m2", 10);
  assert.deepEqual(
    p.standings().map((s) => s.place),
    [1, 1, 3]
  );
});

test("a score after done, or outside a round, is ignored", () => {
  const p = playing(2);
  p.finish("m0", 40);
  assert.equal(p.score("m0", 9999), false);
  assert.equal(p.members.get("m0")!.score, 40);
  p.finish("m1", 1);
  assert.equal(p.score("m1", 9999), false);
});

test("a round nobody finishes times out", () => {
  const p = playing(2);
  assert.equal(p.tick(ROUND_LIMIT_MS - 1), false);
  assert.equal(p.tick(ROUND_LIMIT_MS), true);
  assert.equal(p.phase, "results");
});

test("the game cannot change under people playing it", () => {
  const p = playing();
  assert.equal(p.pick("m0", "tower-stack"), false);
  assert.equal(p.game, "chunk-runner");
});

test("a party holds PARTY_MAX and refuses the next", () => {
  const p = fresh();
  for (let i = 0; i < PARTY_MAX; i++) assert.ok(p.join(`m${i}`, "x"));
  assert.equal(p.join("one-more", "x"), null);
});

test("the host can send everyone to a race or a course, and nowhere else", () => {
  const p = lobby(2);
  assert.equal(p.go("m1", "/race/ABC234"), false, "only the host");
  assert.ok(p.go("m0", "/race/ABC234?cpu=medium&riders=2"));
  assert.ok(p.go("m0", "/play/neon-climb?together=ABC234"));
  assert.equal(p.goTo.n, 2);
  assert.equal(p.go("m0", "https://example.com/"), false, "never off the site");
  assert.equal(p.go("m0", "/account"), false, "only game pages");
});
