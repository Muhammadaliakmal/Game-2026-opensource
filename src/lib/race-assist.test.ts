import test from "node:test";
import assert from "node:assert/strict";
import { angleDelta, assistSteer, trackTangent } from "./race-assist";
import {
  HALF_WIDTH,
  START_LINE_Z,
  lapProgress,
  onTrack,
  trackDistance,
} from "./race-track";

/** Heading that points along a world direction, in the bike's convention. */
const yawOf = (x: number, z: number) => Math.atan2(x, z);

test("the tangent points the way a lap is counted", () => {
  // Walking a short step along the tangent must increase lap progress, at
  // four points around the loop. If this is backwards the assist drives the
  // whole field the wrong way round the circuit.
  const points: Array<[number, number]> = [
    [0, START_LINE_Z],
    [0, -START_LINE_Z],
    [82, 0],
    [-82, 0],
  ];
  for (const [x, z] of points) {
    const [tx, tz] = trackTangent(x, z);
    const before = lapProgress(x, z);
    const after = lapProgress(x + tx * 0.5, z + tz * 0.5);
    // Wrapping at the start line makes a raw comparison meaningless there.
    const forward = after - before;
    const wrapped = forward < -0.5 ? forward + 1 : forward;
    assert.ok(wrapped > 0, `tangent runs backwards at ${x},${z}`);
  }
});

test("a bike already on the line and pointed right is left alone", () => {
  const x = 0;
  const z = START_LINE_Z;
  const [tx, tz] = trackTangent(x, z);
  assert.equal(assistSteer(x, z, yawOf(tx, tz)), 0);
});

test("a bike pointed off the racing direction is steered back", () => {
  const x = 0;
  const z = START_LINE_Z;
  const [tx, tz] = trackTangent(x, z);
  const straight = yawOf(tx, tz);

  // Yaw increases toward the rider's LEFT, so a bike yawed positively needs
  // positive (rightward) steering to come back.
  assert.ok(assistSteer(x, z, straight + 0.4) > 0);
  assert.ok(assistSteer(x, z, straight - 0.4) < 0);
});

test("assist alone gets a bike round the whole circuit", () => {
  // The honest test of a steering assist is not its sign at one point: it is
  // whether a rider who never touches the wheel completes a lap. This drives
  // the same integration the bike does, with the assist as the only input.
  const MAX_YAW_RATE = 1.9;
  const SPEED = 18;
  const step = 1 / 60;

  let x = 0;
  let z = START_LINE_Z;
  let heading = yawOf(...trackTangent(x, z));
  let progress = 0;
  let laps = 0;

  for (let i = 0; i < 60 * 120; i++) {
    const steer = assistSteer(x, z, heading);
    heading -= steer * MAX_YAW_RATE * step;
    x += Math.sin(heading) * SPEED * step;
    z += Math.cos(heading) * SPEED * step;

    assert.ok(Number.isFinite(x) && Number.isFinite(z), "assist went non-finite");
    assert.ok(onTrack(x, z), `assist left the track at ${x}, ${z}`);

    const now = lapProgress(x, z);
    if (now < progress - 0.5) laps++;
    progress = now;
    if (laps >= 1) break;
  }

  assert.ok(laps >= 1, "assist never completed a lap");
});

test("a bike shoved off the racing line is brought back to it", () => {
  const MAX_YAW_RATE = 1.9;
  // Slow enough to stay on the start straight for the whole run: a corner
  // adds a curvature lag of its own, and this test is about the recovery, not
  // about how tidily the assist takes a bend.
  const SPEED = 6;
  const step = 1 / 60;

  // Start hard against the outside rail, pointed straight down the road.
  let x = 0;
  let z = START_LINE_Z + HALF_WIDTH * 0.95;
  let heading = yawOf(...trackTangent(x, z));

  for (let i = 0; i < 60 * 6; i++) {
    const steer = assistSteer(x, z, heading);
    heading -= steer * MAX_YAW_RATE * step;
    x += Math.sin(heading) * SPEED * step;
    z += Math.cos(heading) * SPEED * step;
  }

  // Measured with the field itself rather than against the start line: the
  // bike has moved a long way down the road, so "how far from where it
  // started" would be measuring the wrong thing entirely.
  const offset = Math.abs(trackDistance(x, z));
  assert.ok(offset < HALF_WIDTH * 0.2, `still ${offset.toFixed(2)} off line`);
});

test("angleDelta takes the short way round", () => {
  assert.ok(Math.abs(angleDelta(3.0, -3.0) - 0.2831853) < 1e-6);
  assert.ok(Math.abs(angleDelta(-3.0, 3.0) + 0.2831853) < 1e-6);
  assert.equal(angleDelta(1, 1), 0);
});
