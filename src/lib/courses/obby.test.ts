import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBuiltInDoc } from "../built-in-worlds";
import { reachable, surfaceUnder, surfaces } from "../course-graph";
import { HAZARD_FINISH, isHazard, textureOf, type PartTuple } from "../worlddoc";
import { LAVA_SURFACE } from "../course-kit";
import { TEXTURES } from "../texture-list";
import { touchingHazard } from "@/components/play/hazard";
import { keyOf } from "../cell-key";

const doc = () => buildBuiltInDoc("magma", "u")!;
const key = (s: { x: number; y: number; z: number }) => `${s.x},${s.y},${s.z}`;

test("the gauntlet is mostly lava, and lava is never a surface", () => {
  const d = doc();
  const lava = d.parts.filter(isHazard);
  assert.ok(lava.length > d.parts.length / 2, "an obby over a sea should be mostly sea");

  const all = surfaces(d.parts);
  for (const p of lava) {
    assert.ok(
      !all.byCell.has(`${p[0]},${p[1] + 1},${p[2]}`),
      `lava at ${p[0]},${p[1]},${p[2]} is standable to the solver`
    );
  }
});

test("lava carries the stone crust, which the dressing would never give it", () => {
  assert.equal(TEXTURES[LAVA_SURFACE].name, "stone");
  const d = doc();
  for (const p of d.parts.filter(isHazard)) {
    assert.equal(textureOf(p), LAVA_SURFACE);
  }
});

test("the tile floor is gated by its safe path", () => {
  // Turn every non-hazard block at the tile stage's height into lava and the
  // goal must stop being reachable from the checkpoint before it. That is
  // the proof the stage is a trap and not decoration: the only way across
  // the plate is the path, and the path is the only thing that is not lava.
  const d = doc();
  const all = surfaces(d.parts);
  const cps = d.checkpoints!;
  // The tiles' checkpoint is the fourth; the path plate shares its height.
  const before = cps[3];
  const start = surfaceUnder(before.pos, all)!;
  const finish = surfaceUnder(d.goal!, all)!;
  assert.ok(reachable(start, all).has(key(finish)), "the honest course finishes");

  const plateY = Math.round(before.pos[1]) - 1;
  const flooded: PartTuple[] = d.parts.map((p) =>
    p[1] === plateY && !isHazard(p) && p[3] === 0 && p[5] === 3 && p[4] === 23
      ? [p[0], p[1], p[2], p[3], p[4], HAZARD_FINISH, p[6]]
      : p
  );
  const drowned = surfaces(flooded);
  const from = surfaceUnder(before.pos, drowned)!;
  assert.ok(
    !reachable(from, drowned).has(key(finish)),
    "with the safe tiles turned to lava the goal should be out of reach"
  );
});

test("standing on lava kills, standing beside it does not, brushing a wall does", () => {
  const parts = new Map<string, PartTuple>();
  const put = (x: number, y: number, z: number, finish: number) =>
    parts.set(keyOf(x, y, z), [x, y, z, 0, 9, finish, 0]);
  // A row of tiles at y=4: lava, safe, lava. A lava pillar at (10, 5..6, 7).
  put(4, 4, 5, HAZARD_FINISH);
  put(5, 4, 5, 0);
  put(6, 4, 5, HAZARD_FINISH);
  put(10, 4, 5, 0);
  put(10, 5, 6, HAZARD_FINISH);
  put(10, 6, 6, HAZARD_FINISH);

  // The capsule floats 0.8 above the deck it stands on (top at y=5).
  const stand = 5 + 0.8;
  assert.equal(touchingHazard(parts, 4.5, stand, 5.5), true, "on lava");
  assert.equal(touchingHazard(parts, 5.5, stand, 5.5), false, "on the safe tile");
  // At the very edge of the safe tile, still safe: the floor is judged
  // under the centre, or a one-cell path would be a pixel hunt.
  assert.equal(touchingHazard(parts, 5.05, stand, 5.5), false, "edge of the safe tile");
  assert.equal(touchingHazard(parts, 5.95, stand, 5.5), false, "other edge");
  // A pillar beside the path: clear in the middle, dead on a graze.
  assert.equal(touchingHazard(parts, 10.5, stand, 5.5), false, "middle of the beam");
  assert.equal(touchingHazard(parts, 10.5, stand, 5.85), true, "brushing the pillar");
  // Falling toward the sea: dead before the sole reaches the surface.
  put(20, 0, 20, HAZARD_FINISH);
  assert.equal(touchingHazard(parts, 20.5, 1.5, 20.5), true, "landing in the sea");
  assert.equal(touchingHazard(parts, 20.5, 3, 20.5), false, "still above it");
});
