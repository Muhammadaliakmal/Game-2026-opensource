import test from "node:test";
import assert from "node:assert/strict";
import { createSim, pointsFor, rampAt, spawnAt, windowAt } from "./sim";
import * as T from "./tuning";
import { mulberry32 } from "@/arcade/host/rng";

/**
 * Reflex, played by a machine.
 *
 * The sim is pure and seeded, so a run is reproducible from its seed and its
 * taps — which is what lets these play minutes of the game in a millisecond
 * and assert the things a person cannot check by feel: that the window really
 * does close, that it closes on hits rather than on the clock, that nothing
 * ever leaves the field, and that the run cannot end on a tap that landed.
 */

const DT = 1 / 60;
const sim = (seed = 1) => createSim(mulberry32(seed));

/** Run `seconds` of game with no input. */
function idle(s: ReturnType<typeof sim>, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) s.step(DT, null);
}

/** Play perfectly for `seconds`: tap the oldest target every frame it exists. */
function play(s: ReturnType<typeof sim>, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = s.targets[0];
    s.step(DT, t ? { x: t.x, y: t.y } : null);
  }
}

/** Floating-point interpolation lands a hair off the endpoint. */
const near = (a: number, b: number, why: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} is not ${b}`);

test("the window closes as hits accumulate, and stops at the floor", () => {
  near(windowAt(0), T.WINDOW_START, "the opening window");
  near(windowAt(T.RAMP_HITS), T.WINDOW_END, "the window at the end of the ramp");
  // Past the ramp it does not keep shrinking into the impossible.
  near(windowAt(T.RAMP_HITS * 10), T.WINDOW_END, "the window past the ramp");
  assert.ok(windowAt(10) < windowAt(0));
  assert.ok(windowAt(30) < windowAt(10));
});

test("the ramp is driven by hits, never by elapsed time", () => {
  // The player who is missing is not asking for more speed. A clock-driven
  // ramp punishes exactly the player already struggling.
  const s = sim();
  idle(s, 2.5);
  assert.equal(s.hits, 0);
  assert.equal(rampAt(s.hits), 0);
  near(windowAt(s.hits), T.WINDOW_START, "an idle run's window");
});

test("spawning speeds up too, and also stops", () => {
  near(spawnAt(0), T.SPAWN_START, "the opening interval");
  near(spawnAt(T.RAMP_HITS), T.SPAWN_END, "the interval at the end of the ramp");
  near(spawnAt(T.RAMP_HITS * 5), T.SPAWN_END, "the interval past the ramp");
});

test("a streak pays more, up to the cap", () => {
  assert.equal(pointsFor(0), T.HIT_POINTS);
  assert.equal(pointsFor(1), T.HIT_POINTS + T.STREAK_BONUS);
  assert.equal(pointsFor(T.STREAK_CAP), T.HIT_POINTS + T.STREAK_BONUS * T.STREAK_CAP);
  // Uncapped, the first ninety seconds of every run would be worthless.
  assert.equal(pointsFor(T.STREAK_CAP + 50), pointsFor(T.STREAK_CAP));
});

test("hitting a target scores it, removes it and extends the streak", () => {
  const s = sim();
  idle(s, T.SPAWN_START + DT);
  assert.equal(s.targets.length, 1, "a target should have spawned");

  const t = s.targets[0];
  s.step(DT, { x: t.x, y: t.y });
  assert.equal(s.targets.length, 0, "the target should be gone");
  assert.equal(s.score, T.HIT_POINTS);
  assert.equal(s.streak, 1);
  assert.equal(s.lives, T.LIVES, "a hit costs no life");
  assert.ok(s.events.includes("hit"));
});

test("tapping empty space costs the streak and nothing else", () => {
  // Punishing a miss with a life would make "wait until certain" the correct
  // strategy, which is the opposite of the game.
  const s = sim();
  idle(s, T.SPAWN_START + DT);
  const t = s.targets[0];
  s.step(DT, { x: t.x, y: t.y });
  assert.equal(s.streak, 1);

  s.step(DT, { x: 5, y: 5 });
  assert.equal(s.streak, 0, "the streak should break");
  assert.equal(s.lives, T.LIVES, "an empty tap is not a life");
  assert.equal(s.score, T.HIT_POINTS, "and it scores nothing");
  assert.ok(s.events.includes("miss"));
});

test("a tap on the target's very last frame still counts", () => {
  /*
   * The one unfairness a game made entirely of reaction time cannot afford.
   * Ageing before resolving the tap would expire a target a few milliseconds
   * early and take a life for a press that landed.
   */
  const s = sim();
  idle(s, T.SPAWN_START + DT);
  // By id, not by index: more targets spawn while this one is ageing, so the
  // first slot is not reliably the one being watched.
  const watched = s.targets[0].id;
  const find = () => s.targets.find((t) => t.id === watched);
  const life = s.targets[0].life;

  // Age it to the last frame it is alive for.
  while (true) {
    const t = find();
    if (!t || t.age + DT >= life) break;
    s.step(DT, null);
  }
  const last = find();
  assert.ok(last, "the watched target should still be alive");
  assert.equal(s.lives, T.LIVES, "nothing should have expired yet");

  s.step(DT, { x: last.x, y: last.y });
  assert.equal(find(), undefined, "the tap should have taken it");
  assert.equal(s.lives, T.LIVES, "no life should have been taken");
  assert.equal(s.streak, 1);
  assert.ok(s.events.includes("hit"));
});

test("an expired target costs a life and the streak", () => {
  const s = sim();
  idle(s, T.SPAWN_START + DT);
  assert.equal(s.targets.length, 1);
  idle(s, T.WINDOW_START + 0.1);
  assert.equal(s.lives, T.LIVES - 1);
  assert.equal(s.streak, 0);
});

test("three expiries end the run, once and only once", () => {
  const s = sim();
  idle(s, 60);
  assert.equal(s.over, true);
  assert.ok(s.lives <= 0);
  assert.equal(s.targets.length, 0, "the field is cleared so the freeze is quiet");

  // Stepping an ended run must not raise a second "over" — the host puts up a
  // score screen on it and that can only happen once.
  const before = s.score;
  s.step(DT, null);
  assert.equal(s.events.length, 0);
  assert.equal(s.score, before);
});

test("no target is ever placed off the field", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = sim(seed);
    for (let i = 0; i < 60 * 30; i++) {
      const t = s.targets[0];
      s.step(DT, t ? { x: t.x, y: t.y } : null);
      for (const target of s.targets) {
        assert.ok(
          target.x >= T.TARGET_R && target.x <= T.VIEW_W - T.TARGET_R,
          `seed ${seed}: target at x=${target.x} is off the field`
        );
        assert.ok(
          target.y >= T.TARGET_R && target.y <= T.VIEW_H - T.TARGET_R,
          `seed ${seed}: target at y=${target.y} is off the field`
        );
      }
    }
  }
});

test("live targets never overlap", () => {
  // Two overlapping circles make a tap ambiguous, and an ambiguous tap in a
  // game about precision reads as the game cheating.
  const min = T.MIN_SEPARATION * T.MIN_SEPARATION;
  for (let seed = 1; seed <= 20; seed++) {
    const s = sim(seed);
    for (let i = 0; i < 60 * 30; i++) {
      s.step(DT, null);
      for (let a = 0; a < s.targets.length; a++) {
        for (let b = a + 1; b < s.targets.length; b++) {
          const dx = s.targets[a].x - s.targets[b].x;
          const dy = s.targets[a].y - s.targets[b].y;
          assert.ok(dx * dx + dy * dy >= min, `seed ${seed}: two targets overlap`);
        }
      }
      if (s.over) break;
    }
  }
});

test("never more than the cap on screen", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const s = sim(seed);
    for (let i = 0; i < 60 * 40; i++) {
      s.step(DT, null);
      assert.ok(s.targets.length <= T.MAX_TARGETS);
      if (s.over) break;
    }
  }
});

test("a perfect player survives, scores, and produces no NaN", () => {
  // Three minutes of flawless play. The run must not end, the score must keep
  // climbing, and nothing may drift into NaN — the failure that turns a
  // cabinet into a blank canvas rather than into an error.
  const s = sim(7);
  play(s, 180);
  assert.equal(s.over, false, "a perfect run should not end");
  assert.equal(s.lives, T.LIVES);
  assert.ok(s.score > 0);
  assert.ok(Number.isFinite(s.score), "score went NaN");
  assert.ok(s.best >= s.streak);
  for (const t of s.targets) {
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y), "a target went NaN");
  }
});

test("the same seed and the same taps give the same run", () => {
  const a = sim(42);
  const b = sim(42);
  play(a, 30);
  play(b, 30);
  assert.equal(a.score, b.score);
  assert.equal(a.hits, b.hits);
  assert.deepEqual(
    a.targets.map((t) => [t.x, t.y]),
    b.targets.map((t) => [t.x, t.y])
  );
});
