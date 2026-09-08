import test from "node:test";
import assert from "node:assert/strict";
import {
  GRID_SLOTS,
  HALF_WIDTH,
  RAIL_BAND,
  START_LINE_Z,
  beyondRails,
  onTrack,
  trackDistance,
} from "./race-track";

/**
 * The two predicates the race's recovery is built out of.
 *
 * `Bike.tsx` uses `beyondRails` to decide a bike has left the world and
 * `onTrack` to decide a pose is worth returning to. The relationship between
 * them is the whole safety property, and it is the thing the old height-only
 * recovery got wrong: it remembered poses it should have been recovering from,
 * so a rider who cleared a barrier respawned in mid-air over the same void and
 * fell again, forever.
 */

/** Points all the way round the loop, on the centreline. */
function centreline(steps = 64): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    // March out from the origin until the distance field reads zero: the loop
    // is convex about the centre, so one Newton step on a signed distance is
    // exact enough for a test point.
    let r = 90;
    for (let k = 0; k < 40; k++) r -= trackDistance(Math.sin(th) * r, Math.cos(th) * r);
    out.push([Math.sin(th) * r, Math.cos(th) * r]);
  }
  return out;
}

test("the racing line is never mistaken for the void", () => {
  for (const [x, z] of centreline()) {
    assert.ok(onTrack(x, z), `centreline is off the surface at ${x}, ${z}`);
    assert.ok(!beyondRails(x, z), `centreline reads as past the rails at ${x}, ${z}`);
  }
});

test("running wide onto the kerb is a bad corner, not a recovery", () => {
  // Between the racing surface and the outside of the rail band there is still
  // world underneath. A recovery that fired here would take the race off
  // anybody who touched a kerb, which is most riders, most laps.
  const z = START_LINE_Z + HALF_WIDTH + RAIL_BAND / 2;
  assert.ok(!onTrack(0, z), "the kerb is not the racing surface");
  assert.ok(!beyondRails(0, z), "the kerb still has world under it");
});

test("past the rail band there is nothing, and the bike is told so", () => {
  // One cell beyond everything either generator stamps.
  const z = START_LINE_Z + HALF_WIDTH + RAIL_BAND + 1;
  assert.ok(beyondRails(0, z), "outside the rails should read as void");
  // And the infield, which is just as empty — the loop is stamped as a band,
  // not as a disc, so falling inward is the same fall.
  assert.ok(beyondRails(0, 0), "the infield should read as void");
});

test("a pose over the void can never be recorded as the one to return to", () => {
  // The regression. `onTrack` gates the safe pose and `beyondRails` triggers
  // the recovery, so the two must never both be true — otherwise the bike can
  // remember the place it is about to be rescued from.
  for (let x = -110; x <= 110; x += 1.5) {
    for (let z = -110; z <= 110; z += 1.5) {
      if (beyondRails(x, z)) {
        assert.ok(!onTrack(x, z), `${x}, ${z} is both off the world and safe`);
      }
    }
  }
});

test("every grid slot is on the racing surface", () => {
  // If a slot were not, the recovery would fire on the formation lap and the
  // race would begin by teleporting the whole field.
  for (const [x, , z] of GRID_SLOTS) {
    assert.ok(onTrack(x, z), `grid slot ${x}, ${z} is off the racing surface`);
    assert.ok(!beyondRails(x, z), `grid slot ${x}, ${z} is past the rails`);
  }
});
