import test from "node:test";
import assert from "node:assert/strict";
import { setOpSink, useEditorStore } from "./editor-store";
import { parseOp, type Op } from "@/lib/ops";
import { parkourWorldDoc } from "@/lib/parkour";
import { MAX_CHECKPOINTS, parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";

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

// --- the Phase 5 network seam ---------------------------------------------

/** Collects everything the store would send to a room, then disconnects. */
function withSink(fn: (sent: Op[]) => void) {
  const sent: Op[] = [];
  setOpSink((op) => sent.push(op));
  try {
    fn(sent);
  } finally {
    setOpSink(null);
  }
}

test("a local edit is emitted as a serializable op", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  withSink((sent) => {
    useEditorStore.getState().place([0, 20, 0]);

    assert.equal(sent.length, 1);
    // The real test is that it survives the wire, not just that it exists:
    // anything the sink emits has to parse back on the far side.
    const round = parseOp(JSON.parse(JSON.stringify(sent[0])));
    assert.equal(round.t, "place");
  });
});

test("a drag stroke emits one composite op, not one per painted cell", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  withSink((sent) => {
    useEditorStore.getState().beginStroke();
    for (let x = 0; x < 5; x++) useEditorStore.getState().place([x, 25, 0]);
    assert.equal(sent.length, 0, "nothing is sent mid-stroke");

    useEditorStore.getState().endStroke();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].t, "composite");
    assert.equal(sent[0].t === "composite" ? sent[0].ops.length : 0, 5);
  });
});

test("undo emits the inverse op and redo emits the original", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  withSink((sent) => {
    useEditorStore.getState().place([0, 21, 0]);
    useEditorStore.getState().undo();
    useEditorStore.getState().redo();

    assert.deepEqual(sent.map((o) => o.t), ["place", "erase", "place"]);
  });
});

test("no sink connected means nothing is emitted and editing still works", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const before = useEditorStore.getState().parts.size;
  useEditorStore.getState().place([0, 22, 0]);
  assert.equal(useEditorStore.getState().parts.size, before + 1);
});

test("a peer's edit applies but never lands on the local undo stack", () => {
  // The collaborative-editor bug this exists to prevent: pressing Ctrl+Z and
  // deleting a block somebody else just placed.
  useEditorStore.getState().loadDoc(freshDoc());
  useEditorStore.getState().place([0, 23, 0]);
  const mine = useEditorStore.getState().parts.size;

  useEditorStore.getState().applyRemoteOp({
    t: "place",
    key: "0,24,0",
    part: [0, 24, 0, 0, 5, 0, 0],
  });
  assert.equal(useEditorStore.getState().parts.size, mine + 1);

  useEditorStore.getState().undo();
  // One undo took back my block; the peer's is untouched.
  assert.equal(useEditorStore.getState().parts.has("0,24,0"), true);
  assert.equal(useEditorStore.getState().parts.has("0,23,0"), false);
  assert.equal(useEditorStore.getState().bus.canUndo, false);
});

// --- course markers -------------------------------------------------------

test("a load/save round trip does not drop the course", () => {
  // Regression, and the one that gated the whole course-authoring phase.
  // `toDoc` emitted `goal` verbatim — with a comment explaining that dropping
  // it "would quietly un-finish every remix of the course" — while
  // `checkpoints` and `spawnYaw` beside it were dropped in exactly that way.
  // It was never only a save bug: WorldCanvas builds the Play snapshot from
  // toDoc, so remixing a shipped course and pressing Play stripped its gates.
  const doc = freshDoc();
  assert.ok(doc.checkpoints && doc.checkpoints.length > 0, "fixture has gates");
  assert.ok(doc.spawnYaw !== undefined, "fixture states a facing");

  useEditorStore.getState().loadDoc(doc);
  const saved = useEditorStore.getState().toDoc("user_1");

  assert.deepEqual(saved.checkpoints, doc.checkpoints);
  assert.deepEqual(saved.goal, doc.goal);
  assert.equal(saved.spawnYaw, doc.spawnYaw);
});

test("loading a course does not alias the document's own checkpoint array", () => {
  const doc = freshDoc();
  const before = doc.checkpoints!.length;
  useEditorStore.getState().loadDoc(doc);
  useEditorStore.getState().removeCheckpoint(0);
  assert.equal(doc.checkpoints!.length, before);
});

test("placing the finish is undoable, and lands on the cell's floor", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  const had = useEditorStore.getState().goal;

  useEditorStore.getState().setGoal([3, 9, 5]);
  // Centred in the cell, level with its floor — the top face of the block
  // below, which is what course-kit's `goalOver` computes for shipped courses.
  assert.deepEqual(useEditorStore.getState().goal, [3.5, 9, 5.5]);

  useEditorStore.getState().undo();
  assert.deepEqual(useEditorStore.getState().goal, had);
});

test("clearing the finish stops the world being a course, and undo brings it back", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  useEditorStore.getState().clearGoal();
  assert.equal(useEditorStore.getState().goal, undefined);
  assert.equal(useEditorStore.getState().toDoc("user_1").goal, undefined);

  useEditorStore.getState().undo();
  assert.notEqual(useEditorStore.getState().goal, undefined);
});

test("checkpoints append in placement order and each is undoable", () => {
  const doc = freshDoc();
  useEditorStore.getState().loadDoc({ ...doc, checkpoints: [] });

  useEditorStore.getState().addCheckpoint([0, 5, 0], 1);
  useEditorStore.getState().addCheckpoint([9, 5, 0], 2);
  assert.deepEqual(
    useEditorStore.getState().checkpoints.map((c) => c.pos[0]),
    [0.5, 9.5]
  );

  useEditorStore.getState().undo();
  assert.equal(useEditorStore.getState().checkpoints.length, 1);
});

test("removing a middle checkpoint renumbers, and undo restores the order", () => {
  const doc = freshDoc();
  useEditorStore.getState().loadDoc({ ...doc, checkpoints: [] });
  for (const x of [0, 10, 20]) useEditorStore.getState().addCheckpoint([x, 5, 0], 0);

  useEditorStore.getState().removeCheckpoint(1);
  assert.deepEqual(
    useEditorStore.getState().checkpoints.map((c) => c.pos[0]),
    [0.5, 20.5]
  );

  useEditorStore.getState().undo();
  assert.deepEqual(
    useEditorStore.getState().checkpoints.map((c) => c.pos[0]),
    [0.5, 10.5, 20.5]
  );
});

test("the checkpoint cap is enforced by the tool, not left to the save", () => {
  // An author meeting the cap as a failed save meets it after the work is done.
  const doc = freshDoc();
  useEditorStore.getState().loadDoc({ ...doc, checkpoints: [] });
  for (let i = 0; i < MAX_CHECKPOINTS + 5; i++) {
    useEditorStore.getState().addCheckpoint([i, 5, 0], 0);
  }
  assert.equal(useEditorStore.getState().checkpoints.length, MAX_CHECKPOINTS);
  // And the document it produces is one the schema accepts.
  assert.doesNotThrow(() => parseWorldDoc(useEditorStore.getState().toDoc("user_1")));
});

test("a read-only world refuses course edits too", () => {
  useEditorStore.getState().loadDoc(freshDoc());
  useEditorStore.getState().setReadOnly(true);
  const before = useEditorStore.getState().checkpoints.length;

  useEditorStore.getState().addCheckpoint([0, 5, 0], 0);
  useEditorStore.getState().setGoal([1, 5, 1]);
  useEditorStore.getState().clearGoal();

  assert.equal(useEditorStore.getState().checkpoints.length, before);
  useEditorStore.getState().setReadOnly(false);
});

test("a course edit is emitted to peers as a serializable op", () => {
  const seen: Op[] = [];
  setOpSink((op) => seen.push(op));
  useEditorStore.getState().loadDoc(freshDoc());

  useEditorStore.getState().addCheckpoint([2, 5, 2], 1.5);
  useEditorStore.getState().setGoal([6, 5, 6]);

  setOpSink(null);
  assert.equal(seen.length, 2);
  // Survives the wire, which is the whole point of the op form.
  for (const op of seen) assert.doesNotThrow(() => parseOp(JSON.parse(JSON.stringify(op))));
  assert.equal(seen[0].t, "cp-add");
  assert.equal(seen[1].t, "goal");
});
