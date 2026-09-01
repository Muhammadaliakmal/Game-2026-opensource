import { create } from "zustand";
import type { PartTuple, PropInstance, Shape, WorldDoc, Vec3 } from "@/lib/worlddoc";
import {
  CommandBus,
  placeCmd,
  eraseCmd,
  replaceCmd,
  compositeCmd,
  type Command,
  type PartsHost,
} from "@/lib/command-bus";
import { keyOf, parseKey } from "@/lib/grid";

export type Tool = "place" | "erase" | "spawn";

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
  sky: number;
  /**
   * Props are not editable yet (Phase 3), but they must survive a round trip:
   * loading a doc and saving it back used to drop them on the floor.
   */
  props: PropInstance[];

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

  bus: CommandBus;
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
  /** Drag-painting: everything between begin/end collapses into one undo step. */
  beginStroke(): void;
  endStroke(): void;
  undo(): void;
  redo(): void;

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

  // Non-null while a drag-paint stroke is in progress. Kept outside the store
  // object because it changes on every painted cell and nothing renders from it.
  let stroke: Command[] | null = null;

  /** Run a command now, or bank it into the open stroke. */
  const submit = (c: Command) => {
    if (stroke) {
      c.do();
      stroke.push(c);
    } else {
      get().bus.execute(c);
      set((st) => ({ historyTick: st.historyTick + 1 }));
    }
  };

  return {
  parts: new Map(),
  dirtyTick: 0,

  worldId: null,
  name: "Untitled World",
  spawn: [0, 1, 0],
  sky: 0,
  props: [],

  readOnly: false,
  dirty: false,

  shape: 0,
  colorIndex: 19,
  finish: 0,
  rot: 0,
  tool: "place",

  hoverCell: null,

  bus: new CommandBus(),
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
  setTool: (tool) => set({ tool }),
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

    submit({
      label: "spawn",
      do() {
        set({ spawn: next });
        get().markDirty();
      },
      undo() {
        set({ spawn: prev });
        get().markDirty();
      },
    });
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

    submit(
      prev ? replaceCmd(key, part, prev, partsHost) : placeCmd(key, part, partsHost)
    );
  },

  erase: (cell) => {
    const s = get();
    if (s.readOnly) return;
    const key = keyOf(...cell);
    const prev = s.parts.get(key);
    if (!prev) return;

    submit(eraseCmd(key, prev, partsHost));
  },

  beginStroke: () => {
    stroke = [];
  },

  endStroke: () => {
    const cmds = stroke;
    stroke = null;
    if (!cmds || cmds.length === 0) return;
    // execute() re-runs do(), which re-applies edits already made during the
    // drag. That's safe — every command is an idempotent Map set/delete — and
    // it keeps redo working, which a no-op do() would have broken.
    get().bus.execute(compositeCmd(cmds));
    set((st) => ({ historyTick: st.historyTick + 1 }));
  },

  undo: () => {
    get().bus.undo();
    set((s) => ({ historyTick: s.historyTick + 1 }));
  },

  redo: () => {
    get().bus.redo();
    set((s) => ({ historyTick: s.historyTick + 1 }));
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
      sky: doc.sky,
      props: doc.props,
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
