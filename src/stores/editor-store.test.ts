import test from "node:test";
import assert from "node:assert/strict";
import { useEditorStore } from "./editor-store";
import { parkourWorldDoc } from "@/lib/parkour";
import type { WorldDoc } from "@/lib/worlddoc";

function freshDoc(): WorldDoc {
  const doc = parkourWorldDoc("11111111-1111-1111-1111-111111111111", "user_1");
  return {
    ...doc,
    props: [
      { assetId: "tree-a", pos: [1, 0, 2], rot: [0, 0, 0], scale: [1, 1, 1] },
      { assetId: "rock-b", pos: [4, 0, 5], rot: [0, 1, 0], scale: [2, 2, 2] },
    ],
  };
}

test("a load/save round trip does not drop props", () => {
  // Regression: toDoc() hardcoded `props: []`, so opening any world with props
  // and pressing Save silently deleted them.
  const doc = freshDoc();
  useEditorStore.getState().loadDoc(doc);
  const saved = useEditorStore.getState().toDoc("user_1");
  assert.deepEqual(saved.props, doc.props);
});

test("a load/save round trip preserves every part exactly", () => {
  const doc = freshDoc();
  useEditorStore.getState().loadDoc(doc);
  const saved = useEditorStore.getState().toDoc("user_1");

  assert.equal(saved.parts.length, doc.parts.length);
  const before = new Set(doc.parts.map((p) => p.join(",")));
  for (const p of saved.parts) assert.ok(before.has(p.join(",")));
});

test("a freshly loaded world is not dirty, and editing makes it dirty", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  assert.equal(useEditorStore.getState().dirty, false);

  useEditorStore.getState().place([0, 20, 0]);
  assert.equal(useEditorStore.getState().dirty, true);

  useEditorStore.getState().markSaved();
  assert.equal(useEditorStore.getState().dirty, false);
});

test("a read-only world refuses edits", () => {
  // The editor can open a built-in or someone else's world; it must not be
  // able to change one, or the user builds for twenty minutes and then meets
  // a 403.
  useEditorStore.getState().loadDoc(freshDoc());
  const before = useEditorStore.getState().parts.size;

  useEditorStore.getState().setReadOnly(true);
  useEditorStore.getState().place([0, 30, 0]);
  useEditorStore.getState().erase([0, 0, 0]);

  assert.equal(useEditorStore.getState().parts.size, before);
  assert.equal(useEditorStore.getState().dirty, false);

  useEditorStore.getState().setReadOnly(false);
});

test("undo and redo restore the exact part that was there", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const s = useEditorStore.getState();

  s.place([0, 20, 0]);
  const placed = s.parts.get("0,20,0");
  assert.ok(placed);

  s.undo();
  assert.equal(useEditorStore.getState().parts.has("0,20,0"), false);

  s.redo();
  assert.deepEqual(useEditorStore.getState().parts.get("0,20,0"), placed);
});

test("moving the spawn point is undoable", () => {
  // Spawn is world state like any other edit; if undo could not reach it, the
  // only way back would be to remember the old coordinates.
  useEditorStore.getState().loadDoc(freshDoc());
  const original = useEditorStore.getState().spawn;

  useEditorStore.getState().setSpawn([12, 4, -3]);
  const moved = useEditorStore.getState().spawn;
  assert.notDeepEqual(moved, original);
  // Sits above the chosen cell, so the character lands on the block.
  assert.deepEqual(moved, [12.5, 5.2, -2.5]);

  useEditorStore.getState().undo();
  assert.deepEqual(useEditorStore.getState().spawn, original);

  useEditorStore.getState().redo();
  assert.deepEqual(useEditorStore.getState().spawn, moved);
});

test("a drag stroke collapses into a single undo step", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const before = useEditorStore.getState().parts.size;

  useEditorStore.getState().beginStroke();
  for (let x = 0; x < 10; x++) useEditorStore.getState().place([x, 25, 0]);
  useEditorStore.getState().endStroke();
  assert.equal(useEditorStore.getState().parts.size, before + 10);

  useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().parts.size, before);
});
