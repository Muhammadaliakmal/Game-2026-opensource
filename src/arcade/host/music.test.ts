import test from "node:test";
import assert from "node:assert/strict";
import { BASS, KICKS, PENTATONIC, RIFFS } from "./music";

/**
 * The music itself needs an AudioContext and cannot be heard from here. Its
 * pattern tables can, and they are worth pinning for one specific reason:
 * every value in them ends up as an index into `PENTATONIC` or as a step
 * number, and a bad index there is `undefined`, which becomes `NaN` one
 * multiplication later. WebAudio throws on a non-finite frequency — so a typo
 * in a riff does not sound wrong, it kills the track mid-run and takes the
 * scheduler with it.
 *
 * Everything below is a shape check. None of it has an opinion about whether
 * the music is any good.
 */

const STEPS = 16;

test("every pattern is one bar of sixteenths", () => {
  for (const [i, k] of KICKS.entries()) {
    assert.equal(k.length, STEPS, `kick pattern ${i} is not a bar`);
  }
  for (const [i, r] of RIFFS.entries()) {
    assert.equal(r.length, STEPS, `riff ${i} is not a bar`);
  }
});

test("every riff note is a real scale degree or a rest", () => {
  for (const [i, riff] of RIFFS.entries()) {
    for (const [step, degree] of riff.entries()) {
      assert.ok(
        degree === -1 || (Number.isInteger(degree) && degree >= 0 && degree < PENTATONIC.length),
        `riff ${i} step ${step} is ${degree}, which is not a degree of a ${PENTATONIC.length}-note scale`
      );
      // The thing the whole file is here for: what the scheduler will index.
      if (degree >= 0) assert.ok(Number.isFinite(PENTATONIC[degree]));
    }
  }
});

test("every riff actually plays something", () => {
  // A riff of nothing but rests is silent, and silence in one of four slots
  // reads as the music having cut out rather than as a musical choice.
  for (const [i, riff] of RIFFS.entries()) {
    assert.ok(riff.some((d) => d >= 0), `riff ${i} is entirely rests`);
  }
});

test("every kick pattern lands on the downbeat", () => {
  // Not a rule of music, a rule of this arrangement: the bar boundary is the
  // only thing anchoring a listener when the riff and the pattern both change
  // underneath them.
  for (const [i, k] of KICKS.entries()) {
    assert.equal(k[0], 1, `kick pattern ${i} does not start the bar`);
  }
});

test("the 808 stays inside the bar and the scale", () => {
  for (const b of BASS) {
    assert.ok(b.step >= 0 && b.step < STEPS, `808 step ${b.step} is outside the bar`);
    assert.ok(Number.isFinite(PENTATONIC[b.from]), `808 from-degree ${b.from} is not in the scale`);
    assert.ok(Number.isFinite(PENTATONIC[b.to]), `808 to-degree ${b.to} is not in the scale`);
  }
});

test("no two 808 notes share a step", () => {
  // They would overlap into one voice at double gain, which on a saturated
  // sub is not two notes but a clip.
  const steps = BASS.map((b) => b.step);
  assert.equal(new Set(steps).size, steps.length, "two 808 notes on one step");
});
