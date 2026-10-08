import test from "node:test";
import assert from "node:assert/strict";
import { BOOST_TOP_SPEED, MIN_HZ, engineNote } from "./engine-note";

/**
 * The engine has to sound like a motor on a phone: it revs and shifts rather
 * than whining up one long ramp, and it never asks a phone speaker for a pitch
 * it cannot play.
 */

function sweep(from: number, to: number, step: number) {
  const notes = [];
  let gear = -1;
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
    const n = engineNote(v, gear);
    gear = n.gear;
    notes.push({ v, ...n });
  }
  return notes;
}

test("accelerating shifts up through the gears, and every shift drops the revs", () => {
  const notes = sweep(0, BOOST_TOP_SPEED, 0.05);
  let shifts = 0;
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].gear > notes[i - 1].gear) {
      shifts++;
      assert.ok(notes[i].hz < notes[i - 1].hz - 40, `shift at ${notes[i].v.toFixed(2)} u/s did not drop the revs`);
    } else {
      assert.ok(notes[i].hz >= notes[i - 1].hz - 1e-9, `revs fell inside a gear at ${notes[i].v.toFixed(2)} u/s`);
    }
  }
  assert.equal(shifts, 5);
});

test("never below what a phone speaker can play", () => {
  for (const n of sweep(0, BOOST_TOP_SPEED, 0.1)) assert.ok(n.hz >= MIN_HZ && n.hz >= 90, `${n.hz} Hz`);
});

test("a speed sitting on a shift point does not hunt between two gears", () => {
  let gear = engineNote(8.3, -1).gear;
  const seen = new Set([gear]);
  for (let i = 0; i < 200; i++) {
    const v = 8 + Math.sin(i) * 0.3; // wobbling around the 2nd→3rd shift
    gear = engineNote(v, gear).gear;
    seen.add(gear);
  }
  assert.equal(seen.size, 1, `hunted between gears ${[...seen].join(", ")}`);
});

test("reversing revs like going forward", () => {
  assert.deepEqual(engineNote(-6, -1), engineNote(6, -1));
});
