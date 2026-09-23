import test from "node:test";
import assert from "node:assert/strict";
import * as T from "./tuning";
import { KEYS, buttonsFor, cardAt, createKeyReader, createTouchControls, mergeInput, MENU } from "./controls";
import { neutralInput } from "./ragdoll";

/**
 * Two thumbs on one screen. The thing that must never happen is one
 * player's finger driving the other player's robot.
 */

test("in versus, each half is its own stick", () => {
  const c = createTouchControls("versus");
  c.update([
    { id: 1, x: 120, y: 300 },
    { id: 2, x: 840, y: 300 },
  ]);
  c.update([
    { id: 1, x: 120 + T.STICK_R / 2, y: 300 },
    { id: 2, x: 840, y: 300 - T.STICK_R / 2 },
  ]);
  const [p1, p2] = c.pads;
  assert.ok(p1.active && p2.active);
  assert.ok(Math.abs(p1.x - 0.5) < 1e-9 && p1.y === 0);
  assert.ok(p2.x === 0 && Math.abs(p2.y + 0.5) < 1e-9);
});

test("a finger that wanders across the middle still belongs to its player", () => {
  const c = createTouchControls("versus");
  c.update([{ id: 5, x: 400, y: 300 }]);
  c.update([{ id: 5, x: 700, y: 300 }]);
  assert.ok(c.pads[0].active, "P1 kept the stick");
  assert.ok(!c.pads[1].active, "P2 never got it");
  assert.equal(c.pads[0].x, 1, "and it is pinned at full push");
});

test("the stick centre follows the thumb out, so turning back is immediate", () => {
  const c = createTouchControls("cpu");
  c.update([{ id: 1, x: 200, y: 300 }]);
  c.update([{ id: 1, x: 200 + T.STICK_R * 3, y: 300 }]);
  const p = c.pads[0];
  assert.equal(p.ox, 200 + T.STICK_R * 2);
  // One stick-radius back is already full left, not still right.
  c.update([{ id: 1, x: 200 + T.STICK_R, y: 300 }]);
  assert.equal(p.x, -1);
});

test("lifting a finger lets go of the stick", () => {
  const c = createTouchControls("cpu");
  c.update([{ id: 1, x: 200, y: 300 }]);
  c.update([{ id: 1, x: 250, y: 300 }]);
  c.update([]);
  assert.ok(!c.pads[0].active);
  assert.equal(c.pads[0].x, 0);
});

test("jump is an edge, the heavy is held", () => {
  const c = createTouchControls("cpu");
  const jump = buttonsFor("cpu").find((b) => b.kind === "jump")!;
  const heavy = buttonsFor("cpu").find((b) => b.kind === "heavy")!;
  c.update([{ id: 3, x: jump.x, y: jump.y }]);
  assert.equal(c.pads[0].jump, true);
  c.update([{ id: 3, x: jump.x, y: jump.y }]);
  assert.equal(c.pads[0].jump, false, "a held jump is one jump");
  c.update([{ id: 4, x: heavy.x, y: heavy.y }]);
  c.update([{ id: 4, x: heavy.x, y: heavy.y }]);
  assert.equal(c.pads[0].heavy, true);
  assert.ok(!c.pads[0].active, "a press on a button is not a stick");
});

test("every touch button clears the 48 css px floor on a 390 px-tall phone", () => {
  // Landscape on a small phone: 390 css px of height letterboxes the 540 px
  // view at 390/540. The floor is WCAG 2.5.5's, and tokens.css's.
  const k = 390 / T.VIEW_H;
  for (const b of [...buttonsFor("cpu"), ...buttonsFor("versus")]) {
    assert.ok(b.r * 2 * k >= 48, `${b.kind} is ${(b.r * 2 * k).toFixed(0)} css px`);
  }
  // And the two halves' buttons do not sit on the line between them.
  for (const b of buttonsFor("versus")) {
    const side = b.x < T.VIEW_W / 2 ? 0 : 1;
    assert.equal(side, b.player, `${b.kind} for P${b.player + 1} is on the wrong half`);
    assert.ok(Math.abs(b.x - T.VIEW_W / 2) > b.r, "a button straddles the middle");
  }
});

test("the two keyboard players share no key", () => {
  const p1 = Object.values(KEYS.p1).flat();
  const p2 = Object.values(KEYS.p2).flat();
  for (const k of p1) assert.ok(!p2.includes(k), `${k} is both players'`);
});

test("keys read as a stick, and a thumb on the glass wins", () => {
  const r = createKeyReader(KEYS.p1);
  const keys = { KeyD: true, KeyW: true, Space: true };
  const k = r.read(keys);
  assert.deepEqual(k, { x: 1, y: -1, jump: true, heavy: false });
  assert.equal(r.read(keys).jump, false, "a held key is one jump");
  const c = createTouchControls("cpu");
  c.update([{ id: 1, x: 200, y: 300 }]);
  c.update([{ id: 1, x: 200 - T.STICK_R, y: 300 }]);
  const out = mergeInput(c.pads[0], k, neutralInput());
  assert.equal(out.x, -1, "the thumb, not the key");
});

test("every menu card can be tapped and none overlap", () => {
  for (const card of MENU) assert.equal(cardAt(card.x + card.w / 2, card.y + card.h / 2), card);
  assert.equal(cardAt(5, 5), undefined);
  for (let i = 1; i < MENU.length; i++) assert.ok(MENU[i].x > MENU[i - 1].x + MENU[i - 1].w);
});
