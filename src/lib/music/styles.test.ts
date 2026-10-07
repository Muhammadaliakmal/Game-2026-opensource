import test from "node:test";
import assert from "node:assert/strict";
import { degreeSemis, STYLES, styleForWorld } from "./styles";

/**
 * Shape checks for every style, for the reason the arcade's music test gives:
 * a bad index is `undefined`, `NaN` one multiplication later, and WebAudio
 * throws on a non-finite frequency — so a typo does not sound wrong, it kills
 * the scheduler mid-run. None of this has an opinion about the music.
 */

const STEPS = 16;

for (const s of Object.values(STYLES)) {
  test(`${s.id}: every pattern is one bar`, () => {
    assert.ok(s.kicks.length > 0);
    for (const k of s.kicks) assert.equal(k.length, STEPS);
    for (const r of s.lead?.riffs ?? []) assert.equal(r.length, STEPS);
    if (s.arp) assert.equal(s.arp.pattern.length, STEPS);
    for (const n of s.snares) assert.ok(n >= 0 && n < STEPS);
  });

  test(`${s.id}: every note resolves to a finite pitch`, () => {
    for (const r of s.lead?.riffs ?? []) {
      for (const d of r) if (d >= 0) assert.ok(Number.isFinite(degreeSemis(s.scale, d)));
    }
    for (const n of s.bass?.notes ?? []) {
      assert.ok(n.step >= 0 && n.step < STEPS);
      assert.ok(Number.isFinite(degreeSemis(s.scale, n.from)));
      assert.ok(Number.isFinite(degreeSemis(s.scale, n.to)));
      assert.ok(n.len > 0);
    }
    assert.ok(s.chords.length > 0);
    for (const c of s.chords) assert.ok(c.length > 0 && c.every(Number.isFinite));
  });

  test(`${s.id}: tempo, swing and sends are in range`, () => {
    assert.ok(s.bpm >= 50 && s.bpm <= 180);
    assert.ok(s.swing >= 0 && s.swing < 0.5);
    assert.ok(s.reverb >= 0 && s.reverb <= 1 && s.echo >= 0 && s.echo <= 1);
  });

  test(`${s.id}: no two bass notes share a step`, () => {
    const steps = (s.bass?.notes ?? []).map((n) => n.step);
    assert.equal(new Set(steps).size, steps.length);
  });
}

test("degrees past the scale climb an octave", () => {
  assert.equal(degreeSemis([0, 3, 5, 7, 10], 5), 12);
  assert.equal(degreeSemis([0, 3, 5, 7, 10], 7), 17);
});

test("worlds pick a style", () => {
  assert.equal(styleForWorld("magma"), "inferno");
  assert.equal(styleForWorld("cottage"), "lofi");
  assert.equal(styleForWorld("parkour"), "nightrun");
});
