import { test } from "node:test";
import assert from "node:assert/strict";
import { FOOT_CONTROLS } from "./controls";
import { DEFAULT_BINDS, FOOT_LABELS, keyLabel } from "@/lib/keybinds";

/**
 * `content/controls.ts` is a hand-written copy of the default bindings, for
 * the reason its own comment gives. This is the thing that stops it being a
 * lie: rebind a default in `lib/keybinds.ts` and forget the guide pages, and
 * this fails with both values named.
 *
 * It checks the keys and the action names, not the notes — a note is prose
 * about what a control is for, and prose is not derivable from a keycode.
 */

/** The four movement rows are one row on the guide page; everything else is 1:1. */
const MOVEMENT = new Set(["forward", "backward", "leftward", "rightward"]);

test("every default foot binding appears on the guide controls table", () => {
  const listed = new Map(FOOT_CONTROLS.map((r) => [r.action, r.keys]));

  for (const [action, codes] of Object.entries(DEFAULT_BINDS.foot)) {
    if (MOVEMENT.has(action)) continue;
    const label = FOOT_LABELS[action as keyof typeof FOOT_LABELS];
    const keys = listed.get(label);
    assert.ok(
      keys,
      `lib/keybinds.ts binds "${label}" but content/controls.ts has no row ` +
        `for it. Add one, or rename the row to match FOOT_LABELS.`
    );

    // `Shift L` / `Shift R` are one key to a reader and two codes to the
    // browser. The guide says "Shift"; that is correct rather than stale.
    const expected = codes.map((c) => keyLabel(c).replace(/ [LR]$/, ""));
    for (const key of keys) {
      assert.ok(
        expected.includes(key),
        `content/controls.ts says "${label}" is ${key}, but the default ` +
          `binding is ${expected.join(" or ")}.`
      );
    }
  }
});

test("the movement row matches the default movement keys", () => {
  const move = FOOT_CONTROLS.find((r) => r.action === "Move");
  assert.ok(move, "content/controls.ts has no movement row");
  const letters = [
    DEFAULT_BINDS.foot.forward[0],
    DEFAULT_BINDS.foot.leftward[0],
    DEFAULT_BINDS.foot.backward[0],
    DEFAULT_BINDS.foot.rightward[0],
  ].map(keyLabel);
  assert.deepEqual(
    [...move.keys].sort(),
    [...letters].sort(),
    "The guide's movement keys are not the default movement keys."
  );
});
