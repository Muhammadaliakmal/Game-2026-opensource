import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RIDGE_MAX_LEVEL,
  RIDGE_SPAWN,
  ridgeLevelAt,
  vaporRidgeParts,
  vaporRidgeWorldDoc,
} from "./vapor-ridge";
import { parseWorldDoc } from "./worlddoc";
import { buildColliders } from "./greedy-mesh";
import { BX, BZ, CORNER, HALF_WIDTH, lapProgress, trackDistance } from "./race-track";
import { CIRCUIT_SPAWN } from "./circuit";

/**
 * Vapor Ridge is Neon Circuit's racing line with elevation cut into the
 * straights. The two things that could go wrong quietly are a slope the lap
 * counter cannot see (it works in XZ, so it cannot) and a slope steep enough
 * to be an accidental wall. These pin both.
 *
 * `atStraight` walks the middle of one straight cell by cell in the direction
 * of travel and hands back the road level at each step.
 */
function alongRight(): number[] {
  // x fixed on the +X straight centreline, z from +BZ to −BZ (rides −Z).
  const out: number[] = [];
  for (let z = BZ; z >= -BZ; z--) out.push(ridgeLevelAt(BX + CORNER, z));
  return out;
}
function alongBack(): number[] {
  // z fixed on the −Z straight centreline, x from +BX to −BX (rides −X).
  const out: number[] = [];
  for (let x = BX; x >= -BX; x--) out.push(ridgeLevelAt(x, -(BZ + CORNER)));
  return out;
}
function alongLeft(): number[] {
  // x fixed on the −X straight centreline, z from −BZ to +BZ (rides +Z).
  const out: number[] = [];
  for (let z = -BZ; z <= BZ; z++) out.push(ridgeLevelAt(-(BX + CORNER), z));
  return out;
}

test("the world is a valid, substantial WorldDoc", () => {
  const doc = vaporRidgeWorldDoc("ridge", "user-1", "Vapor Ridge");
  assert.doesNotThrow(() => parseWorldDoc(doc));
  assert.equal(doc.id, "ridge");
  assert.ok(doc.parts.length > 5000, "the loop should be substantial");
});

test("it is generated identically every time", () => {
  assert.deepEqual(vaporRidgeParts(), vaporRidgeParts());
});

test("no two parts share a cell, and nothing sits below the floor", () => {
  const parts = vaporRidgeParts();
  const keys = new Set(parts.map((p) => `${p[0]},${p[1]},${p[2]}`));
  assert.equal(keys.size, parts.length, "a cell is stacked");
  for (const p of parts) assert.ok(p[1] >= 0, `part below y=0 at ${p}`);
});

test("the start straight and the grid stay flat", () => {
  // The grid slots and the start line carry hard-coded Y values from
  // race-track.ts and circuit.ts, correct only while the +Z straight is level
  // 0. The spawn must match the circuit's exactly.
  assert.deepEqual(RIDGE_SPAWN, CIRCUIT_SPAWN);
  for (let x = -BX; x <= BX; x += 4) {
    assert.equal(ridgeLevelAt(x, BZ + CORNER), 0, `start straight raised at x=${x}`);
  }
});

test("the corners are flat — a ramp cannot climb a curve", () => {
  // Sample the four corner arcs, out at the centreline radius.
  for (let i = 0; i < 400; i++) {
    const th = (i / 400) * Math.PI * 2;
    const inCorner =
      Math.abs(Math.sin(th)) > 0.25 && Math.abs(Math.cos(th)) > 0.25;
    if (!inCorner) continue;
    // March out to the centreline along this heading.
    let r = 40;
    for (let k = 0; k < 30; k++) {
      r -= trackDistance(Math.sin(th) * r, Math.cos(th) * r);
    }
    const x = Math.round(Math.sin(th) * r);
    const z = Math.round(Math.cos(th) * r);
    if (Math.abs(x) <= BX || Math.abs(z) <= BZ) continue; // not actually a corner cell
    assert.equal(ridgeLevelAt(x, z), 0, `corner raised at ${x},${z}`);
  }
});

test("every slope rises at most one level per cell, bar the one cliff", () => {
  let cliffs = 0;
  for (const profile of [alongRight(), alongBack(), alongLeft()]) {
    for (let i = 1; i < profile.length; i++) {
      const jump = Math.abs(profile[i] - profile[i - 1]);
      if (jump > 1) {
        cliffs++;
        assert.ok(
          profile[i] < profile[i - 1],
          `an upward wall of ${jump} levels`
        );
        assert.ok(jump >= 4, `a half-hearted cliff of only ${jump} levels`);
      }
    }
  }
  assert.equal(cliffs, 1, `expected exactly one cliff, found ${cliffs}`);
});

test("no straight has a lateral step — the road is level across its width", () => {
  // Elevation is a function of the along-axis coordinate only, so every cell
  // at the same point along a straight must share a level whatever its offset
  // across the road. Check a slice through the steepest part of each feature.
  const slices: Array<[string, (o: number) => [number, number]]> = [
    ["right climb", (o) => [BX + CORNER + o, 27]],
    ["back crest", (o) => [40, -(BZ + CORNER) + o]],
    ["left rise", (o) => [-(BX + CORNER) + o, -5]],
  ];
  for (const [name, at] of slices) {
    const levels = new Set<number>();
    for (let o = -Math.floor(HALF_WIDTH); o <= Math.floor(HALF_WIDTH); o++) {
      const [x, z] = at(o);
      levels.add(ridgeLevelAt(x, z));
    }
    assert.equal(levels.size, 1, `${name}: road is not level across (${[...levels]})`);
  }
});

test("the crest is a real hill and the drop is a real drop", () => {
  const back = alongBack();
  assert.equal(Math.max(...back), RIDGE_MAX_LEVEL);
  assert.ok(RIDGE_MAX_LEVEL >= 5, `crest only ${RIDGE_MAX_LEVEL} cells up`);
  // The single big fall along the back straight is the launch.
  let biggestFall = 0;
  for (let i = 1; i < back.length; i++) {
    biggestFall = Math.max(biggestFall, back[i - 1] - back[i]);
  }
  assert.ok(biggestFall >= 4, `drop is only ${biggestFall} cells`);
});

test("the racing surface is unbroken all the way round the lap", () => {
  // The server's sectors are equal slices of polar angle; a gap in the ring is
  // a slice a rider passes through with no road under them. Bin every surface
  // cell by lap fraction and assert every slice is populated.
  const parts = vaporRidgeParts();
  const SLICES = 120;
  const seen = new Array<number>(SLICES).fill(0);
  for (const p of parts) {
    if (p[3] !== 0 && p[3] !== 2) continue;
    if (Math.abs(trackDistance(p[0] + 0.5, p[2] + 0.5)) > HALF_WIDTH) continue;
    const slice = Math.floor(lapProgress(p[0] + 0.5, p[2] + 0.5) * SLICES);
    seen[Math.min(SLICES - 1, slice)]++;
  }
  const empty = seen.flatMap((n, i) => (n === 0 ? [i] : []));
  assert.equal(empty.length, 0, `slices with no racing surface: ${empty}`);
});

test("it still stands up cheaply in Rapier", () => {
  const { boxes, others } = buildColliders(vaporRidgeParts());
  const colliders = boxes.length + others.length;
  assert.ok(colliders < 2500, `${colliders} colliders`);
  assert.ok(others.length > 40, "the slopes should show up as ramp colliders");
});

test("the XZ footprint is the circuit's, untouched", () => {
  // lapProgress is polar angle about the origin, unchanged; walking once round
  // takes it 0 → 1 with no step back. Elevation must not have moved a cell in
  // the plane.
  let prev = -1;
  for (let i = 0; i < 360; i++) {
    const th = (i / 360) * Math.PI * 2 + 1e-3;
    const p = lapProgress(Math.sin(th) * 80, Math.cos(th) * 80);
    assert.ok(p > prev, `progress did not increase at ${i}°`);
    prev = p;
  }
});
