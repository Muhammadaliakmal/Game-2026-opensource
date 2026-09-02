import { create } from "zustand";
import type { PartTuple, PropInstance, Shape, WorldDoc, Vec3 } from "@/lib/worlddoc";
import {
  CommandBus,
  compositeCmd,
  type Command,
  type PartsHost,
  type PropsHost,
} from "@/lib/command-bus";
import { commandFor, invertOp, type LeafOp, type Op, type OpHost } from "@/lib/ops";
import { keyOf, parseKey } from "@/lib/grid";

/**
 * Where locally-made edits go once they have been applied. Null until a
 * multiplayer room connects (Phase 5) — with no sink, every edit path below
 * behaves exactly as it did before ops existed.
 */
let sink: ((op: Op) => void) | null = null;
export const setOpSink = (fn: ((op: Op) => void) | null) => {
  sink = fn;
};

/**
 * Build and erase are the two that mutate geometry. Paint recolours a block
 * without rebuilding it, pick adopts a block's settings as the brush (the
 * eyedropper), spawn moves where Play starts you, and prop places/selects
 * catalog props (SPEC §12 Phase 3) — free-transform, not grid-snapped, so it
 * doesn't share the other tools' cell-based click handling.
 */
export type Tool = "place" | "erase" | "paint" | "pick" | "spawn" | "prop";

interface EditorState {
  /**
   * The world's parts, keyed "x,y,z". A Map — NOT React state — so placing a
   * block is an O(1) mutation that never triggers a re-render. Renderers watch
   * `dirtyTick` instead and update instance matrices imperatively.
   */
  parts: Map<string, PartTuple>;
  /** Bumped by markDirty(); the instanced renderer keys its update effect off this. */
  dirtyTick: number;

  worldId: string | null;
  name: string;
  spawn: Vec3;
  /** Undefined for a world that is not a course. See WorldDoc.goal. */
  goal: Vec3 | undefined;
  sky: number;
  props: PropInstance[];
  /** Catalog id of the prop the "prop" tool places next — see PropBrowser. */
  activePropId: string | null;
  /**
   * The placed instance PivotControls is currently attached to, identified
   * by object reference rather than array index (see command-bus.ts's
   * movePropCmd) so it survives adds/removes elsewhere in the array. Cleared
   * whenever the instance it points to is deleted or undone away.
   */
  selectedProp: PropInstance | null;
  /**
   * Bumped only when *which* instance is selected changes (placeProp,
   * selectProp) — never by the per-frame identity churn of updatePropLive.
   * PropGizmo keys PivotControls off this, so a drag's continuous re-renders
   * don't remount the gizmo, but picking a different prop does.
   */
  selectionEpoch: number;
  /** Snapshot taken at drag start, so endPropDrag can build one undoable
   * move from the whole gesture instead of one command per frame. */
  dragOrigin: PropInstance | null;

  /**
   * Whether this world can be saved at all — false for a built-in and for
   * anyone else's world. Known only after the load, so the editor can say so
   * up front instead of failing at the first Save.
   */
  readOnly: boolean;
  /** Unsaved edits since the last load or save. */
  dirty: boolean;

  // Current brush settings.
  shape: Shape;
  colorIndex: number;
  finish: number;
  rot: number;
  tool: Tool;

  // The cell the cursor is currently over, or null when pointing at nothing.
  hoverCell: [number, number, number] | null;

  bus: CommandBus<Op>;
  /** Bumped whenever undo/redo availability changes, so toolbars can react. */
  historyTick: number;

  saving: boolean;
  lastSavedAt: number | null;

  markDirty(): void;
  setShape(s: Shape): void;
  setColorIndex(i: number): void;
  setFinish(f: number): void;
  rotateBrush(): void;
  setTool(t: Tool): void;
  setHoverCell(c: [number, number, number] | null): void;
  setName(n: string): void;
  setReadOnly(v: boolean): void;
  setSpawn(cell: [number, number, number]): void;
  markSaved(): void;

  place(cell: [number, number, number]): void;
  erase(cell: [number, number, number]): void;
  /** Recolour the block in a cell, keeping its shape and rotation. */
  paint(cell: [number, number, number]): void;
  /** Adopt the block in a cell as the current brush. */
  pick(cell: [number, number, number]): void;
  /** Drag-painting: everything between begin/end collapses into one undo step. */
  beginStroke(): void;
  endStroke(): void;
  undo(): void;
  redo(): void;
  /**
   * Applies a peer's edit. Deliberately NOT pushed onto the undo stack —
   * Ctrl+Z undoing someone else's block is the classic collaborative-editor
   * bug, and it is much easier to never write than to fix later.
   */
  applyRemoteOp(op: Op): void;

  setActivePropId(id: string | null): void;
  /** Places a new instance of `activePropId` and selects it. No-op without one. */
  placeProp(pos: Vec3): void;
  selectProp(instance: PropInstance | null): void;
  /** Removes the selected instance; undoable like any other edit. */
  deleteSelectedProp(): void;
  /** PivotControls drag start: remembers the pre-drag transform to diff against. */
  beginPropDrag(): void;
  /** Applied on every drag frame — NOT pushed onto the undo stack itself
   * (see endPropDrag), so dragging doesn't fill history with per-frame steps. */
  updatePropLive(next: PropInstance): void;
  /** Turns the whole drag gesture into one undoable move. */
  endPropDrag(): void;

  loadDoc(doc: WorldDoc): void;
  toDoc(ownerId: string): WorldDoc;
  partCount(): number;
}

export const useEditorStore = create<EditorState>((set, get) => {
  // Commands resolve the store lazily through this, so they always act on the
  // live Map rather than a snapshot captured when the command was created.
  const partsHost = (): PartsHost => ({
    parts: get().parts,
    markDirty: get().markDirty,
  });

  const propsHost = (): PropsHost => ({
    props: get().props,
    setProps: (props) => set({ props }),
    markDirty: get().markDirty,
  });

  const opHost: OpHost = {
    parts: partsHost,
    props: propsHost,
    setSpawn: (spawn) => set({ spawn }),
    markDirty: () => get().markDirty(),
  };

  // Non-null while a drag-paint stroke is in progress. Kept outside the store
  // object because it changes on every painted cell and nothing renders from it.
  // Commands and ops are banked in step: the commands drive undo, the ops are
  // what the stroke sends as a single message when it ends.
  let stroke: { cmds: Command[]; ops: LeafOp[] } | null = null;

  /** Run a command now, or bank it into the open stroke. */
  const submit = (c: Command, op: Op) => {
    if (stroke) {
      c.do();
      stroke.cmds.push(c);
    } else {
      get().bus.execute(c, op);
      set((st) => ({ historyTick: st.historyTick + 1 }));
    }
  };

  /**
   * The single path every local edit takes: apply it here, then hand the same
   * edit — as data — to the network. Mid-stroke edits are banked and sent once
   * at endStroke, so a drag is one undo step and one message, not fifty.
   */
  const dispatch = (op: LeafOp) => {
    submit(commandFor(op, opHost), op);
    if (stroke) stroke.ops.push(op);
    else sink?.(op);
  };

  return {
  parts: new Map(),
  dirtyTick: 0,

  worldId: null,
  name: "Untitled World",
  spawn: [0, 1, 0],
  goal: undefined,
  sky: 0,
  props: [],
  activePropId: null,
  selectedProp: null,
  selectionEpoch: 0,
  dragOrigin: null,

  readOnly: false,
  dirty: false,

  shape: 0,
  colorIndex: 19,
  finish: 0,
  rot: 0,
  tool: "place",

  hoverCell: null,

  bus: new CommandBus<Op>(),
  historyTick: 0,

  saving: false,
  lastSavedAt: null,

  // Bumps the renderer tick AND flags unsaved work — every edit path in the
  // app funnels through here, which is what makes the "unsaved" state honest.
  markDirty: () => set((s) => ({ dirtyTick: s.dirtyTick + 1, dirty: true })),

  setShape: (shape) => set({ shape }),
  setColorIndex: (colorIndex) => set({ colorIndex }),
  setFinish: (finish) => set({ finish }),
  rotateBrush: () => set((s) => ({ rot: (s.rot + 1) % 4 })),
  setTool: (tool) =>
    // Leaving the prop tool drops the PivotControls selection — otherwise a
    // stale selection would keep rendering handles over a build/erase pass.
    set((s) => (s.tool === "prop" && tool !== "prop" ? { tool, selectedProp: null } : { tool })),
  setName: (name) => set({ name, dirty: true }),
  setReadOnly: (readOnly) => set({ readOnly }),
  markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

  /**
   * Move the spawn point to a cell. Goes through the command bus like any
   * other edit, so Ctrl+Z puts it back — nothing the player does in the
   * editor should be the one thing undo can't reach.
   */
  setSpawn: (cell) => {
    const prev = get().spawn;
    // Sit the capsule a little above the cell floor so the player lands on the
    // block rather than starting intersecting it.
    const next: Vec3 = [cell[0] + 0.5, cell[1] + 1.2, cell[2] + 0.5];
    if (prev[0] === next[0] && prev[1] === next[1] && prev[2] === next[2]) return;

    dispatch({ t: "spawn", prev, next });
  },

  setHoverCell: (hoverCell) => {
    // Only write when the cell actually changed — this fires every pointer move.
    const prev = get().hoverCell;
    if (
      prev === hoverCell ||
      (prev &&
        hoverCell &&
        prev[0] === hoverCell[0] &&
        prev[1] === hoverCell[1] &&
        prev[2] === hoverCell[2])
    ) {
      return;
    }
    set({ hoverCell });
  },

  place: (cell) => {
    const s = get();
    if (s.readOnly) return;
    const key = keyOf(...cell);
    const part: PartTuple = [
      cell[0],
      cell[1],
      cell[2],
      s.shape,
      s.colorIndex,
      s.finish,
      s.rot,
    ];
    const prev = s.parts.get(key);
    // Placing an identical part is a no-op — don't pollute the undo stack.
    if (prev && prev.every((v, i) => v === part[i])) return;

    dispatch(prev ? { t: "replace", key, next: part, prev } : { t: "place", key, part });
  },

  erase: (cell) => {
    const s = get();
    if (s.readOnly) return;
    const key = keyOf(...cell);
    const prev = s.parts.get(key);
    if (!prev) return;

    dispatch({ t: "erase", key, prev });
  },

  paint: (cell) => {
    const s = get();
    if (s.readOnly) return;

    const key = keyOf(...cell);
    const prev = s.parts.get(key);
    // Nothing to recolour: painting empty space would be a surprise placement.
    if (!prev) return;
    if (prev[4] === s.colorIndex && prev[5] === s.finish) return;

    const next: PartTuple = [
      prev[0], prev[1], prev[2],
      prev[3],
      s.colorIndex,
      s.finish,
      prev[6],
    ];
    dispatch({ t: "replace", key, next, prev });
  },

  pick: (cell) => {
    const part = get().parts.get(keyOf(...cell));
    if (!part) return;
    // Picking is a read, so it is not an undoable edit and never marks the
    // world dirty — it only moves the brush.
    set({ shape: part[3], colorIndex: part[4], finish: part[5], rot: part[6] });
  },

  beginStroke: () => {
    stroke = { cmds: [], ops: [] };
  },

  endStroke: () => {
    const banked = stroke;
    stroke = null;
    if (!banked || banked.cmds.length === 0) return;
    // execute() re-runs do(), which re-applies edits already made during the
    // drag. That's safe — every command is an idempotent Map set/delete — and
    // it keeps redo working, which a no-op do() would have broken.
    const op: Op =
      banked.ops.length === 1 ? banked.ops[0] : { t: "composite", ops: banked.ops };
    get().bus.execute(compositeCmd(banked.cmds), op);
    set((st) => ({ historyTick: st.historyTick + 1 }));
    sink?.(op);
  },

  // An undo is an edit like any other as far as peers are concerned: they get
  // the inverse op, not a "someone undid something" message they would have to
  // reason about against their own history.
  undo: () => {
    const op = get().bus.undo();
    set((s) => ({ historyTick: s.historyTick + 1 }));
    if (op) sink?.(invertOp(op));
  },

  redo: () => {
    const op = get().bus.redo();
    set((s) => ({ historyTick: s.historyTick + 1 }));
    if (op) sink?.(op);
  },

  applyRemoteOp: (op) => {
    commandFor(op, opHost).do();
  },

  setActivePropId: (activePropId) => set({ activePropId }),

  placeProp: (pos) => {
    const s = get();
    if (s.readOnly || !s.activePropId) return;
    const instance: PropInstance = {
      assetId: s.activePropId,
      pos,
      rot: [0, 0, 0],
      scale: [1, 1, 1],
    };
    dispatch({ t: "prop-add", instance });
    set((st) => ({ selectedProp: instance, selectionEpoch: st.selectionEpoch + 1 }));
  },

  selectProp: (selectedProp) =>
    set((st) => ({ selectedProp, selectionEpoch: st.selectionEpoch + 1 })),

  deleteSelectedProp: () => {
    const s = get();
    if (s.readOnly || !s.selectedProp) return;
    dispatch({ t: "prop-remove", instance: s.selectedProp });
    set({ selectedProp: null });
  },

  beginPropDrag: () => set((s) => ({ dragOrigin: s.selectedProp })),

  // Direct set, not `submit()`: a drag fires this every frame, and only the
  // gesture as a whole (endPropDrag) should be one undo step.
  updatePropLive: (next) => {
    const s = get();
    if (!s.selectedProp) return;
    const prevRef = s.selectedProp;
    set((st) => ({
      props: st.props.map((p) => (p === prevRef ? next : p)),
      selectedProp: next,
      dirty: true,
      dirtyTick: st.dirtyTick + 1,
    }));
  },

  endPropDrag: () => {
    const s = get();
    const { dragOrigin, selectedProp } = s;
    set({ dragOrigin: null });
    if (!dragOrigin || !selectedProp || dragOrigin === selectedProp) return;
    dispatch({ t: "prop-move", prev: dragOrigin, next: selectedProp });
  },

  loadDoc: (doc) => {
    const parts = new Map<string, PartTuple>();
    for (const p of doc.parts) parts.set(keyOf(p[0], p[1], p[2]), p);
    get().bus.clear();
    set((s) => ({
      parts,
      worldId: doc.id,
      name: doc.name,
      spawn: doc.spawn,
      goal: doc.goal,
      sky: doc.sky,
      props: doc.props,
      selectedProp: null,
      dragOrigin: null,
      // A freshly loaded world has nothing unsaved in it yet.
      dirty: false,
      lastSavedAt: null,
      dirtyTick: s.dirtyTick + 1,
      historyTick: s.historyTick + 1,
    }));
  },

  toDoc: (ownerId) => {
    const s = get();
    return {
      v: 1,
      id: s.worldId ?? "",
      name: s.name,
      ownerId,
      spawn: s.spawn,
      // Verbatim, for the same reason as props below: nothing in the editor
      // moves the goal yet, and dropping it here would quietly un-finish every
      // remix of the course.
      goal: s.goal,
      sky: s.sky,
      parts: [...s.parts.values()],
      // Verbatim: nothing in the editor edits props yet, and saving [] here
      // would quietly delete them from any world that has them.
      props: s.props,
    };
  },

    partCount: () => get().parts.size,
  };
});

export { keyOf, parseKey };
