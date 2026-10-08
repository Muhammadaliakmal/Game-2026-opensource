import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "@/arcade/host/rng";
import { createMatch } from "./match";
import { neutralInput } from "./ragdoll";
import { applySnapshot, inputMsg, readInputMsg, snapshotOf, type DuelSnapshot } from "./net";

/**
 * A guest's duel is the host's, told over the wire. If the snapshot forgets a
 * field the renderer reads, the guest sees the wrong health bar, the wrong
 * weapon after round two, or a robot that never falls — and nothing throws.
 */

test("a guest match fed snapshots shows the host's fight, through every round", () => {
  const host = createMatch(mulberry32(9));
  const guest = createMatch(mulberry32(9));
  const a = neutralInput();
  const b = neutralInput();
  const rng = mulberry32(4);
  let rounds = 0;

  for (let step = 0; step < 60 * 240 && host.phase !== "over"; step++) {
    // Two button-mashers, so the fight has hits, knockdowns and round ends.
    if (step % 20 === 0) {
      a.x = rng() * 2 - 1;
      a.heavy = rng() < 0.4;
      a.jump = rng() < 0.1;
      b.x = rng() * 2 - 1;
      b.heavy = rng() < 0.4;
      b.jump = rng() < 0.1;
    }
    host.step(1 / 60, a, b);
    const wire = JSON.parse(JSON.stringify(snapshotOf(host))) as DuelSnapshot;
    applySnapshot(guest, wire);

    if (host.events.some((e) => e.type === "round")) rounds++;
    assert.equal(guest.phase, host.phase);
    assert.equal(guest.round, host.round);
    assert.deepEqual(guest.wins, host.wins);
    assert.equal(guest.fighters[0].weapon.id, host.fighters[0].weapon.id, "weapon follows the round");
    for (const i of [0, 1] as const) {
      const g = guest.fighters[i];
      const h = host.fighters[i];
      assert.ok(Math.abs(g.hp - h.hp) <= 0.01, "health bar");
      assert.equal(g.ko, h.ko);
      assert.equal(g.facing, h.facing);
      assert.equal(g.links.length, h.links.length, "the weapon's links were rebuilt");
      for (let p = 0; p < h.x.length; p++) {
        assert.ok(Math.abs(g.x[p] - h.x[p]) <= 0.01 && Math.abs(g.y[p] - h.y[p]) <= 0.01, `particle ${p}`);
      }
    }
    assert.deepEqual(guest.events.map((e) => e.type), host.events.map((e) => e.type), "sounds and effects");
  }
  assert.ok(rounds >= 2, `only ${rounds} rounds were fought`);
});

test("an input message survives the wire and cannot exceed the stick", () => {
  const into = neutralInput();
  readInputMsg(JSON.parse(JSON.stringify(inputMsg({ x: 0.5, y: -1, jump: true, heavy: false }))), into);
  assert.deepEqual(into, { x: 0.5, y: -1, jump: true, heavy: false });
  readInputMsg({ k: "in", x: 40, y: Number.NaN, j: false, h: true }, into);
  assert.deepEqual(into, { x: 1, y: 0, jump: false, heavy: true });
});
