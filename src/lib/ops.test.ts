import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyOp,
  commandFor,
  docFromState,
  invertOp,
  parseOp,
  stateFromDoc,
  type Op,
  type OpHost,
  type WorldState,
} from "./ops";
import { emptyWorldDoc, type PartTuple, type PropInstance } from "./worlddoc";
import type { PartsHost, PropsHost } from "./command-bus";

const part = (x: number, y: number, z: number, color = 19): PartTuple => [x, y, z, 0, color, 0, 0];
const prop = (assetId: string, x = 0): PropInstance => ({
  assetId,
  pos: [x, 0, 0],
  rot: [0, 0, 0],
  scale: [1, 1, 1],
});

const emptyState = (): WorldState => ({ parts: new Map(), props: [], spawn: [0, 1, 0] });

// --- schema ---------------------------------------------------------------

test("parseOp accepts a well-formed place op", () => {
  const op = parseOp({ t: "place", key: "1,2,3", part: part(1, 2, 3) });
  assert.equal(op.t, "place");
});

test("parseOp rejects an out-of-range palette index", () => {
  assert.throws(() => parseOp({ t: "place", key: "0,0,0", part: [0, 0, 0, 0, 99, 0, 0] }));
});

test("parseOp rejects a key that disagrees with the part coordinates", () => {
  // The exact forgery the refinement exists for: a peer writing one cell's
  // tuple under another cell's key would desync every client permanently.
  assert.throws(() => parseOp({ t: "place", key: "9,9,9", part: part(1, 2, 3) }));
});

test("parseOp rejects a malformed cell key", () => {
  assert.throws(() => parseOp({ t: "erase", key: "1,2", prev: part(1, 2, 3) }));
});

test("parseOp checks the children of a composite too", () => {
  assert.throws(() =>
    parseOp({
      t: "composite",
      ops: [
        { t: "place", key: "0,0,0", part: part(0, 0, 0) },
        { t: "place", key: "5,5,5", part: part(1, 1, 1) },
      ],
    })
  );
});

test("parseOp rejects a nested composite", () => {
  assert.throws(() =>
    parseOp({ t: "composite", ops: [{ t: "composite", ops: [] }] })
  );
});

// --- applying -------------------------------------------------------------

test("applyOp places, replaces and erases a cell", () => {
  const s = emptyState();
  applyOp(s, { t: "place", key: "1,2,3", part: part(1, 2, 3) });
  assert.equal(s.parts.size, 1);

  applyOp(s, { t: "replace", key: "1,2,3", next: part(1, 2, 3, 4), prev: part(1, 2, 3) });
  assert.equal(s.parts.get("1,2,3")![4], 4);

  applyOp(s, { t: "erase", key: "1,2,3", prev: part(1, 2, 3, 4) });
  assert.equal(s.parts.size, 0);
});

test("applyOp handles props by value, not by reference", () => {
  const s = emptyState();
  const a = prop("tree");
  applyOp(s, { t: "prop-add", instance: a });

  // A copy, as it would arrive over the wire — never the same object.
  const wireCopy: PropInstance = JSON.parse(JSON.stringify(a));
  applyOp(s, { t: "prop-move", prev: wireCopy, next: prop("tree", 5) });
  assert.deepEqual(s.props[0].pos, [5, 0, 0]);

  applyOp(s, { t: "prop-remove", instance: prop("tree", 5) });
  assert.deepEqual(s.props, []);
});

test("a composite applies its children in order", () => {
  const s = emptyState();
  applyOp(s, {
    t: "composite",
    ops: [
      { t: "place", key: "0,0,0", part: part(0, 0, 0) },
      { t: "place", key: "0,1,0", part: part(0, 1, 0) },
      { t: "erase", key: "0,0,0", prev: part(0, 0, 0) },
    ],
  });
  assert.deepEqual([...s.parts.keys()], ["0,1,0"]);
});

test("invertOp undoes any op, and a composite unwinds in reverse", () => {
  const ops: Op[] = [
    { t: "place", key: "0,0,0", part: part(0, 0, 0) },
    { t: "replace", key: "0,0,0", next: part(0, 0, 0, 7), prev: part(0, 0, 0) },
    { t: "spawn", prev: [0, 1, 0], next: [4, 2, 4] },
    { t: "prop-add", instance: prop("rock") },
    {
      t: "composite",
      ops: [
        { t: "place", key: "1,0,0", part: part(1, 0, 0) },
        // Depends on the placement above — inverting in order rather than in
        // reverse would resurrect the wrong tuple here.
        { t: "replace", key: "1,0,0", next: part(1, 0, 0, 3), prev: part(1, 0, 0) },
      ],
    },
  ];

  const s = emptyState();
  for (const op of ops) applyOp(s, op);
  for (const op of [...ops].reverse()) applyOp(s, invertOp(op));

  assert.equal(s.parts.size, 0);
  assert.deepEqual(s.props, []);
  assert.deepEqual(s.spawn, [0, 1, 0]);
});

test("a doc survives a round trip through WorldState", () => {
  const doc = emptyWorldDoc("id", "user_1");
  doc.parts = [part(0, 0, 0), part(0, 1, 0)];
  doc.props = [prop("tree")];
  const back = docFromState(doc, stateFromDoc(doc));
  assert.deepEqual(back.parts, doc.parts);
  assert.deepEqual(back.props, doc.props);
});

// --- commandFor -----------------------------------------------------------

/** A stand-in for the editor store: the same surface, none of the zustand. */
function fakeHost() {
  const state = { parts: new Map<string, PartTuple>(), props: [] as PropInstance[], spawn: [0, 1, 0] as [number, number, number], dirty: 0 };
  const host: OpHost = {
    parts: (): PartsHost => ({ parts: state.parts, markDirty: () => state.dirty++ }),
    props: (): PropsHost => ({
      props: state.props,
      setProps: (next) => {
        state.props = next;
      },
      markDirty: () => state.dirty++,
    }),
    setSpawn: (v) => {
      state.spawn = v;
    },
    markDirty: () => state.dirty++,
  };
  return { state, host };
}

test("commandFor round-trips an op into a working undoable command", () => {
  const { state, host } = fakeHost();
  const cmd = commandFor({ t: "place", key: "1,2,3", part: part(1, 2, 3) }, host);

  cmd.do();
  assert.equal(state.parts.size, 1);
  cmd.undo();
  assert.equal(state.parts.size, 0);
  assert.ok(state.dirty >= 2, "every edit marks the world dirty");
});

test("commandFor drives the spawn point through the same seam", () => {
  const { state, host } = fakeHost();
  const cmd = commandFor({ t: "spawn", prev: [0, 1, 0], next: [3, 1, 3] }, host);
  cmd.do();
  assert.deepEqual(state.spawn, [3, 1, 3]);
  cmd.undo();
  assert.deepEqual(state.spawn, [0, 1, 0]);
});

test("a prop op that arrived over the wire finds the live instance by value", () => {
  const { state, host } = fakeHost();
  const live = prop("lamp");
  state.props = [live];

  // The reference is gone — this is a structurally equal copy, which is all a
  // peer can ever send. The command must still delete the right instance.
  const wireCopy: PropInstance = JSON.parse(JSON.stringify(live));
  commandFor({ t: "prop-remove", instance: wireCopy }, host).do();
  assert.deepEqual(state.props, []);
});

test("a composite op becomes one undoable command", () => {
  const { state, host } = fakeHost();
  const cmd = commandFor(
    {
      t: "composite",
      ops: [
        { t: "place", key: "0,0,0", part: part(0, 0, 0) },
        { t: "place", key: "0,1,0", part: part(0, 1, 0) },
      ],
    },
    host
  );
  cmd.do();
  assert.equal(state.parts.size, 2);
  cmd.undo();
  assert.equal(state.parts.size, 0);
});
