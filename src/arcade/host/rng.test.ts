import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "./rng";

test("the same seed replays the same run", () => {
  // The whole point: a reported seed has to reproduce the run it came from.
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 500; i++) assert.equal(a(), b());
});

test("different seeds do not walk in step", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let same = 0;
  for (let i = 0; i < 200; i++) if (a() === b()) same++;
  assert.equal(same, 0);
});

test("values stay in [0, 1)", () => {
  // Anything that indexes an array with `rng() * n | 0` breaks on a 1.
  const r = mulberry32(0xc0ffee);
  for (let i = 0; i < 20000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("the distribution is flat enough to tune difficulty against", () => {
  // Not a statistics suite — just enough that a weighted pick built on this
  // behaves like its weights say it does.
  const r = mulberry32(7);
  const buckets = new Array(10).fill(0);
  const n = 100_000;
  for (let i = 0; i < n; i++) buckets[Math.floor(r() * 10)]++;
  for (const b of buckets) {
    assert.ok(Math.abs(b - n / 10) < n / 100, `bucket skew: ${b}`);
  }
});
