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

test("placing a prop selects it and is undoable", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const before = useEditorStore.getState().props.length;

  useEditorStore.getState().setActivePropId("crate");
  useEditorStore.getState().placeProp([3, 0, 3]);

  const s = useEditorStore.getState();
  assert.equal(s.props.length, before + 1);
  assert.equal(s.selectedProp?.assetId, "crate");
  assert.deepEqual(s.selectedProp?.pos, [3, 0, 3]);

  useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().props.length, before);

  useEditorStore.getState().redo();
  assert.equal(useEditorStore.getState().props.length, before + 1);
});

test("placing a prop with no active catalog id is a no-op", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const before = useEditorStore.getState().props.length;

  useEditorStore.getState().setActivePropId(null);
  useEditorStore.getState().placeProp([3, 0, 3]);

  assert.equal(useEditorStore.getState().props.length, before);
});

test("deleting the selected prop is undoable and clears the selection", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const before = useEditorStore.getState().props.length;

  useEditorStore.getState().setActivePropId("crate");
  useEditorStore.getState().placeProp([3, 0, 3]);
  useEditorStore.getState().deleteSelectedProp();

  const s = useEditorStore.getState();
  assert.equal(s.props.length, before);
  assert.equal(s.selectedProp, null);

  useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().props.length, before + 1);
});

test("a PivotControls drag collapses into a single undo step", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  useEditorStore.getState().setActivePropId("crate");
  useEditorStore.getState().placeProp([0, 0, 0]);
  const placed = useEditorStore.getState().selectedProp!;

  useEditorStore.getState().beginPropDrag();
  // A drag calls this every frame; only the final position should matter.
  for (let x = 1; x <= 5; x++) {
    useEditorStore.getState().updatePropLive({ ...placed, pos: [x, 0, 0] });
  }
  useEditorStore.getState().endPropDrag();

  const moved = useEditorStore.getState().selectedProp;
  assert.deepEqual(moved?.pos, [5, 0, 0]);

  useEditorStore.getState().undo();
  assert.deepEqual(
    useEditorStore.getState().props.find((p) => p.assetId === "crate")?.pos,
    [0, 0, 0]
  );

  useEditorStore.getState().redo();
  assert.deepEqual(
    useEditorStore.getState().props.find((p) => p.assetId === "crate")?.pos,
    [5, 0, 0]
  );
});

test("switching away from the prop tool clears the selection", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  useEditorStore.getState().setTool("prop");
  useEditorStore.getState().setActivePropId("crate");
  useEditorStore.getState().placeProp([0, 0, 0]);
  assert.ok(useEditorStore.getState().selectedProp);

  useEditorStore.getState().setTool("place");
  assert.equal(useEditorStore.getState().selectedProp, null);
});
