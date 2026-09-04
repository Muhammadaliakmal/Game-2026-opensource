import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BINDS,
  FOOT_ACTIONS,
  MAX_KEYS_PER_ACTION,
  PRESETS,
  RIDE_ACTIONS,
  findConflicts,
  keyLabel,
  matches,
  normalizeBinds,
  presetOf,
  setBinding,
} from "./keybinds";

test("normalize fills in an action the stored layout has never heard of", () => {
  // The shape a v1 save would have had, before boost and drift existed.
  const old = {
    foot: { forward: ["KeyW"] },
    ride: { forward: ["KeyW"], steerLeft: ["KeyA"] },
  };
  const binds = normalizeBinds(old);

  assert.deepEqual(binds.foot.forward, ["KeyW"]);
  assert.deepEqual(binds.ride.boost, DEFAULT_BINDS.ride.boost);
  for (const action of FOOT_ACTIONS) assert.ok(Array.isArray(binds.foot[action]));
  for (const action of RIDE_ACTIONS) assert.ok(Array.isArray(binds.ride[action]));
});

test("normalize survives garbage without losing the rest of the layout", () => {
  const binds = normalizeBinds({
    foot: { forward: "KeyW", jump: [null, 7, "Space", ""] },
    ride: 42,
  });

  // A non-array is not a choice, so the default stands.
  assert.deepEqual(binds.foot.forward, DEFAULT_BINDS.foot.forward);
  // An array is a choice; only its unusable entries are dropped.
  assert.deepEqual(binds.foot.jump, ["Space"]);
  assert.deepEqual(binds.ride.brake, DEFAULT_BINDS.ride.brake);
});

test("an explicitly empty binding is kept, not refilled", () => {
  // "I never want to be able to do this" has to survive a reload, or the
  // setting undoes itself the next time the game starts.
  const binds = normalizeBinds({ foot: { recenter: [] } });
  assert.deepEqual(binds.foot.recenter, []);
});

test("duplicate codes collapse and the list is capped", () => {
  const binds = normalizeBinds({
    foot: { jump: ["Space", "Space", "KeyJ", "KeyK", "KeyL", "KeyM"] },
  });
  assert.deepEqual(binds.foot.jump, ["Space", "KeyJ", "KeyK"]);
  assert.equal(binds.foot.jump.length, MAX_KEYS_PER_ACTION);
});

test("matches answers per context, so W can drive and walk", () => {
  const binds = normalizeBinds(null);
  assert.ok(matches(binds, "foot", "forward", "KeyW"));
  assert.ok(matches(binds, "ride", "forward", "KeyW"));
  assert.ok(!matches(binds, "foot", "jump", "KeyW"));
  assert.ok(!matches(binds, "foot", "nonsense", "KeyW"));
});

test("the shipped layouts have no conflicts", () => {
  assert.deepEqual(findConflicts(normalizeBinds(null)), []);
  for (const id of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
    assert.deepEqual(
      findConflicts(normalizeBinds(PRESETS[id].binds)),
      [],
      `${id} preset binds a key twice`
    );
  }
});

test("a conflict is reported within a context and never across one", () => {
  // Brake and drift on the same key: allowed, but it must be shown.
  const binds = setBinding(normalizeBinds(null), "ride", "drift", ["Space"]);
  const clashes = findConflicts(binds);

  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].context, "ride");
  assert.equal(clashes[0].code, "Space");
  assert.deepEqual([...clashes[0].actions].sort(), ["brake", "drift"]);
});

test("setBinding does not mutate the layout it was given", () => {
  const before = normalizeBinds(null);
  const snapshot = JSON.stringify(before);
  const after = setBinding(before, "foot", "jump", ["KeyJ"]);

  assert.equal(JSON.stringify(before), snapshot);
  assert.deepEqual(after.foot.jump, ["KeyJ"]);
});

test("presetOf recognises a shipped layout and an edited one", () => {
  assert.equal(presetOf(normalizeBinds(PRESETS.esdf.binds)), "esdf");
  assert.equal(presetOf(normalizeBinds(DEFAULT_BINDS)), "wasd");
  assert.equal(
    presetOf(setBinding(normalizeBinds(null), "foot", "jump", ["KeyJ"])),
    null
  );
});

test("key labels are what a player would write on a sticker", () => {
  assert.equal(keyLabel("KeyW"), "W");
  assert.equal(keyLabel("Digit3"), "3");
  assert.equal(keyLabel("ArrowLeft"), "←");
  assert.equal(keyLabel("ShiftLeft"), "Shift L");
  assert.equal(keyLabel("Numpad5"), "Num 5");
  assert.equal(keyLabel(""), "—");
  // Unknown codes still render as something rather than disappearing.
  assert.equal(keyLabel("Lang1"), "Lang1");
});
