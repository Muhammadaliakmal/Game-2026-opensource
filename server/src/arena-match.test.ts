import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA, ArenaMatch } from "./arena-match.ts";

const SPAWN: [number, number, number] = [0, 2, 0];

/** Two fighters, standing on top of each other so every swing is in reach. */
function duel(now = 0) {
  const m = new ArenaMatch(SPAWN);
  m.join("a", "Ava", now);
  m.join("b", "Bo", now);
  return m;
}

test("a match waits until both fighters are in", () => {
  const m = new ArenaMatch(SPAWN);
  assert.equal(m.phase, "waiting");
  m.join("a", "Ava", 0);
  assert.equal(m.phase, "waiting");
  m.join("b", "Bo", 0);
  assert.equal(m.phase, "fighting");
});

test("a third player is turned away — a duel is two people", () => {
  const m = duel();
  assert.equal(m.join("c", "Cass", 0), null);
  assert.equal(m.fighters.size, ARENA.maxFighters);
});

test("swinging before the match starts does nothing", () => {
  const m = new ArenaMatch(SPAWN);
  m.join("a", "Ava", 0);
  const r = m.attack("a", 0);
  assert.equal(r.ok === false && r.reason, "not-fighting");
});

test("a hit in reach takes health off the other fighter", () => {
  const m = duel();
  const r = m.attack("a", 1000);

  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.targetId, "b");
  assert.equal(m.fighters.get("b")!.hp, ARENA.maxHp - ARENA.damage);
  assert.equal(m.fighters.get("a")!.hp, ARENA.maxHp, "the attacker is untouched");
});

test("a swing out of reach misses", () => {
  const m = duel();
  m.move("b", { x: 50, y: 2, z: 0, yaw: 0 });

  const r = m.attack("a", 1000);
  assert.equal(r.ok === false && r.reason, "no-target");
  assert.equal(m.fighters.get("b")!.hp, ARENA.maxHp);
});

test("reach is measured in three dimensions, so standing on someone's head is not a hit", () => {
  const m = duel();
  m.move("b", { x: 0, y: 2 + ARENA.reach + 1, z: 0, yaw: 0 });
  assert.equal(m.attack("a", 1000).ok, false);
});

test("the cooldown holds, and a missed swing still spends it", () => {
  const m = duel();
  assert.equal(m.attack("a", 1000).ok, true);

  const tooSoon = m.attack("a", 1000 + ARENA.cooldown - 1);
  assert.equal(tooSoon.ok === false && tooSoon.reason, "cooldown");

  assert.equal(m.attack("a", 1000 + ARENA.cooldown).ok, true);

  // A whiff is not free: otherwise spamming attack costs nothing and the
  // cooldown only ever punishes the player who was already landing hits.
  m.move("b", { x: 99, y: 2, z: 0, yaw: 0 });
  let t = 5000;
  assert.equal(m.attack("a", t).ok, false, "out of reach");
  const after = m.attack("a", t + 10);
  assert.equal(after.ok === false && after.reason, "cooldown");
});

test("four hits knock a fighter down and score a point", () => {
  const m = duel();
  let t = 0;
  let last;
  for (let i = 0; i < ARENA.maxHp / ARENA.damage; i++) {
    t += ARENA.cooldown;
    last = m.attack("a", t);
  }

  assert.equal(last!.ok === true && last!.knockdown, true);
  assert.equal(m.fighters.get("b")!.hp, 0);
  assert.equal(m.fighters.get("a")!.score, 1);
  assert.equal(m.fighters.get("b")!.downedAt, t);
});

test("a downed fighter can neither be hit again nor swing back", () => {
  const m = duel();
  let t = 0;
  for (let i = 0; i < 4; i++) m.attack("a", (t += ARENA.cooldown));

  const onTheFloor = m.attack("b", (t += ARENA.cooldown));
  assert.equal(onTheFloor.ok === false && onTheFloor.reason, "downed");

  // And no free points for hitting someone who is already out.
  const again = m.attack("a", (t += ARENA.cooldown));
  assert.equal(again.ok === false && again.reason, "no-target");
  assert.equal(m.fighters.get("a")!.score, 1);
});

test("a knockdown stands back up, at full health, after the delay", () => {
  const m = duel();
  let t = 0;
  for (let i = 0; i < 4; i++) m.attack("a", (t += ARENA.cooldown));
  m.move("b", { x: 9, y: 9, z: 9, yaw: 1 });

  assert.deepEqual(m.tick(t + ARENA.respawnDelay - 1), [], "not yet");

  const revived = m.tick(t + ARENA.respawnDelay);
  assert.deepEqual(revived.map((r) => r.id), ["b"]);
  const b = m.fighters.get("b")!;
  assert.equal(b.hp, ARENA.maxHp);
  assert.equal(b.downedAt, null);
  assert.deepEqual([b.x, b.y, b.z], SPAWN, "and back at the spawn point");
});

test("five knockdowns wins the match", () => {
  const m = duel();
  let t = 0;
  const knockDownB = () => {
    for (let i = 0; i < 4; i++) m.attack("a", (t += ARENA.cooldown));
    t += ARENA.respawnDelay;
    m.tick(t);
  };
  for (let i = 0; i < ARENA.knockdownsToWin; i++) knockDownB();

  assert.equal(m.phase, "over");
  assert.equal(m.winner, "a");
  assert.equal(m.fighters.get("a")!.score, ARENA.knockdownsToWin);

  // The fight is finished: no more hits, and no more respawns either.
  assert.equal(m.attack("a", (t += ARENA.cooldown)).ok, false);
  assert.deepEqual(m.tick(t + 10_000), []);
});

test("a rematch clears the scoreboard and starts again", () => {
  const m = duel();
  let t = 0;
  for (let round = 0; round < ARENA.knockdownsToWin; round++) {
    for (let i = 0; i < 4; i++) m.attack("a", (t += ARENA.cooldown));
    m.tick((t += ARENA.respawnDelay));
  }
  assert.equal(m.phase, "over");

  m.rematch((t += 100));
  assert.equal(m.phase, "fighting");
  assert.equal(m.winner, null);
  for (const f of m.fighters.values()) {
    assert.equal(f.score, 0);
    assert.equal(f.hp, ARENA.maxHp);
  }
  assert.equal(m.attack("a", (t += ARENA.cooldown)).ok, true);
});

test("someone leaving pauses the match but keeps the score", () => {
  const m = duel();
  let t = 0;
  for (let i = 0; i < 4; i++) m.attack("a", (t += ARENA.cooldown));

  m.leave("b", (t += 10));
  assert.equal(m.phase, "waiting");
  assert.equal(m.fighters.get("a")!.score, 1);

  // Whoever fills the seat resumes the fight rather than starting a new one.
  m.join("c", "Cass", (t += 10));
  assert.equal(m.phase, "fighting");
  assert.equal(m.fighters.get("a")!.score, 1);
});

test("a fighter who was down when the match paused is not held down by the clock", () => {
  const m = duel();
  let t = 0;
  for (let i = 0; i < 4; i++) m.attack("a", (t += ARENA.cooldown));

  // B is down. A leaves for a long while; the respawn timer must not have run
  // out in a match nobody could play.
  m.leave("a", (t += 10));
  t += 60_000;
  m.join("c", "Cass", t);

  assert.equal(m.phase, "fighting");
  assert.deepEqual(m.tick(t + ARENA.respawnDelay - 1), []);
  assert.deepEqual(m.tick(t + ARENA.respawnDelay).map((r) => r.id), ["b"]);
});
