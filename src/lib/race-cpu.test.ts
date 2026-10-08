import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import { CPU_DIFFICULTIES, LAP_LENGTH, createCpuRider, distanceAt, lineAt, type CpuDifficulty } from "./race-cpu";
import { BX, BZ, CORNER, GRID_SLOTS, onTrack } from "./race-track";
import { RACE, Race, gridPose } from "./race-rules";

/**
 * A CPU rider is only fair if it stays on the road, goes the right way round,
 * and is slower on Easy than on Hard. Each of those is a number here.
 */

test("the centreline is the track's own loop, the right way round", () => {
  const straights = 2 * (2 * BX) + 2 * (2 * BZ);
  const corners = 2 * Math.PI * CORNER;
  assert.ok(Math.abs(LAP_LENGTH - (straights + corners)) < 2, `lap is ${LAP_LENGTH}`);
  const start = lineAt(0);
  assert.ok(Math.abs(start.x) < 0.6 && start.dx > 0.99, "starts on the line, heading +x like the grid");
  for (let s = 0; s < LAP_LENGTH; s += 3) {
    const p = lineAt(s);
    assert.ok(onTrack(p.x, p.z), `off the road at s=${s}`);
  }
});

test("a grid slot is found on the line", () => {
  const [x, , z] = GRID_SLOTS[0];
  const s = distanceAt(x, z);
  assert.ok(Math.abs(s - (LAP_LENGTH + x)) < 1, `slot at s=${s}`);
});

function lapTime(d: CpuDifficulty, seed = 1) {
  const cpu = createCpuRider(d, mulberry32(seed));
  cpu.place(gridPose(0));
  let t = 0;
  let travelled = 0;
  let last = cpu.step(0, true);
  while (travelled < LAP_LENGTH * 2) {
    const p = cpu.step(1 / 30, true);
    assert.ok(onTrack(p.x, p.z), `${d} rode off the road at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    travelled += Math.hypot(p.x - last.x, p.z - last.z);
    last = p;
    t += 1 / 30;
  }
  return t / 2;
}

test("Easy is slower than Medium, which is slower than Hard", () => {
  const [easy, medium, hard] = CPU_DIFFICULTIES.map((d) => lapTime(d));
  assert.ok(easy > medium && medium > hard, `laps ${easy.toFixed(1)} / ${medium.toFixed(1)} / ${hard.toFixed(1)}`);
  // A person at full throttle (18 u/s) laps in about LAP_LENGTH / 18 seconds.
  const flatOut = LAP_LENGTH / 18;
  assert.ok(hard < flatOut * 1.15, `hard (${hard.toFixed(1)}s) should be near a full-throttle lap (${flatOut.toFixed(1)}s)`);
  assert.ok(easy > flatOut * 1.3, `easy (${easy.toFixed(1)}s) should be well off the pace`);
});

test("the race rules count a CPU's laps and give it a place", () => {
  const race = new Race();
  const cpu = createCpuRider("hard", mulberry32(3));
  race.setTarget(1, 0);
  const r = race.join("cpu-0", "Volt", 0)!;
  cpu.place(r);
  let now = 0;
  race.tick(RACE.countdownMs + 1);
  now = RACE.countdownMs + 1;
  for (let i = 0; i < 30 * 600 && race.phase !== "finished"; i++) {
    now += 1000 / 30;
    race.move("cpu-0", cpu.step(1 / 30, race.phase === "racing"), now);
    race.tick(now);
  }
  assert.equal(race.phase, "finished", "three laps were never counted");
  assert.equal(race.riders.get("cpu-0")!.place, 1);
});

test("a rider stands still until the lights go", () => {
  const cpu = createCpuRider("hard", mulberry32(5));
  cpu.place(gridPose(1));
  const a = cpu.step(1, false);
  const b = cpu.step(1, false);
  assert.deepEqual(a, b);
});
