import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, type Sim } from "./sim";
import { rayOf } from "./generate";
import * as T from "./tuning";

const DT = 1 / 60;
const run = (sim: Sim, seconds: number) => {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
};

/** Tap the middle of a line's head cell. */
const tapLine = (sim: Sim, i: number) => {
  const head = sim.board.lines[i].cells[0];
  sim.tapCell((head % sim.board.cols) + 0.5, Math.floor(head / sim.board.cols) + 0.5);
};

/** A present line whose exit is blocked by another present line, if any. */
function blockedLine(sim: Sim): number {
  const { board } = sim;
  const owner = new Int32Array(board.cols * board.rows).fill(-1);
  board.lines.forEach((l, i) => {
    if (sim.lines[i].present) l.cells.forEach((c) => (owner[c] = i));
  });
  for (let i = 0; i < board.lines.length; i++) {
    if (!sim.lines[i].present) continue;
    const l = board.lines[i];
    if (rayOf(board.cols, board.rows, l.cells[0], l.dir).some((c) => owner[c] >= 0)) return i;
  }
  return -1;
}

test("taps wait for the deal, then the stored order clears the board", () => {
  const sim = createSim(1234, 4);
  tapLine(sim, sim.board.order[0]);
  assert.equal(sim.remaining, sim.board.lines.length, "a tap during the deal does nothing");
  run(sim, T.INTRO + 0.05);
  assert.equal(sim.phase, "play");

  for (const i of sim.board.order) tapLine(sim, i);
  assert.equal(sim.remaining, 0);
  assert.equal(sim.phase, "clear");
  assert.equal(sim.hearts, T.HEARTS);
  // Every pull landed inside one chain window, so the chain climbed.
  assert.ok(sim.chain > 0);

  run(sim, T.CLEAR_HOLD + 0.05);
  assert.equal(sim.level, 5, "the next board is dealt");
  assert.equal(sim.phase, "intro");
});

test("a blocked tap bumps, costs a heart, and leaves the line in place", () => {
  const sim = createSim(77, 8);
  run(sim, T.INTRO + 0.05);
  const i = blockedLine(sim);
  assert.ok(i >= 0, "level 8 should open with at least one blocked line");
  tapLine(sim, i);
  assert.equal(sim.hearts, T.HEARTS - 1);
  assert.ok(sim.lines[i].present);
  assert.ok(sim.events.some((e) => e.type === "bump"));
  run(sim, 1);
  assert.equal(sim.lines[i].s, 0, "the bump springs all the way back");
});

test("three mistakes end the run; a clean board heals one heart", () => {
  const sim = createSim(77, 8);
  run(sim, T.INTRO + 0.05);
  for (let k = 0; k < T.HEARTS; k++) tapLine(sim, blockedLine(sim));
  assert.equal(sim.phase, "lost");
  run(sim, T.LOST_HOLD + 0.05);
  assert.equal(sim.phase, "done");

  const heal = createSim(5, 6);
  run(heal, T.INTRO + 0.05);
  tapLine(heal, blockedLine(heal));
  assert.equal(heal.hearts, T.HEARTS - 1);
  // That board had a mistake, so clearing it heals nothing...
  for (const i of heal.board.order) if (heal.lines[i].present) tapLine(heal, i);
  assert.equal(heal.hearts, T.HEARTS - 1);
  run(heal, T.CLEAR_HOLD + T.INTRO + 0.1);
  // ...and a clean one gives the heart back.
  for (const i of heal.board.order) tapLine(heal, i);
  assert.equal(heal.hearts, T.HEARTS);
});

test("the hint always points at a line that can leave", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const sim = createSim(seed, 10);
    run(sim, T.INTRO + 0.05);
    // Pull a few first so the hint is not just the generator's first line.
    for (const i of sim.board.order.slice(0, 3)) tapLine(sim, i);
    sim.hint();
    const h = sim.hintId;
    assert.ok(h >= 0);
    const before = sim.hearts;
    tapLine(sim, h);
    assert.equal(sim.hearts, before, `seed ${seed}: the hinted line was blocked`);
    sim.hint();
    assert.equal(sim.hintId, -1, "one hint per board");
  }
});

test("a pulled line slides off and stops being drawn", () => {
  const sim = createSim(9, 3);
  run(sim, T.INTRO + 0.05);
  const i = sim.board.order[0];
  tapLine(sim, i);
  let exited = false;
  for (let t = 0; t < 3 && sim.lines[i].drawn; t += DT) {
    sim.step(DT);
    if (sim.events.some((e) => e.type === "exit" && e.id === i)) exited = true;
  }
  assert.ok(exited, "an exit event fires as the head leaves the board");
  assert.equal(sim.lines[i].drawn, false);
});
