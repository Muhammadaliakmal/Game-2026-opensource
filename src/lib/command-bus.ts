import type { PartTuple, PropInstance } from "./worlddoc";

export interface Command {
  do(): void;
  undo(): void;
  label: string;
}

/**
 * Undo/redo stack. Commands mutate the zustand parts Map directly and then
 * flag the instanced renderer dirty — nothing here goes through React state.
 *
 * This is also the network seam for Phase 5: the same Commands become the
 * messages a multiplayer room broadcasts, so multiplayer is a retrofit
 * rather than a rewrite.
 */
export class CommandBus<M = unknown> {
  private past: { c: Command; meta?: M }[] = [];
  private future: { c: Command; meta?: M }[] = [];
  private max = 200;

  /**
   * `meta` rides along with the command and comes back out of undo/redo. The
   * editor stores each edit's serializable `Op` there, which is what lets an
   * undo be broadcast to peers as an ordinary edit (see stores/editor-store).
   */
  execute(c: Command, meta?: M) {
    c.do();
    this.past.push({ c, meta });
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
  }

  /** Returns the undone command's meta, or undefined if there was nothing to undo. */
  undo(): M | undefined {
    const entry = this.past.pop();
    if (!entry) return;
    entry.c.undo();
    this.future.push(entry);
    return entry.meta;
  }

  /** Returns the redone command's meta, or undefined if there was nothing to redo. */
  redo(): M | undefined {
    const entry = this.future.pop();
    if (!entry) return;
    entry.c.do();
    this.past.push(entry);
    return entry.meta;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}

/** Minimal surface the commands need — keeps them decoupled from the store's full shape. */
export interface PartsHost {
  parts: Map<string, PartTuple>;
  markDirty(): void;
}

export const placeCmd = (
  key: string,
  part: PartTuple,
  host: () => PartsHost
): Command => ({
  label: "place",
  do() {
    const h = host();
    h.parts.set(key, part);
    h.markDirty();
  },
  undo() {
    const h = host();
    h.parts.delete(key);
    h.markDirty();
  },
});

export const eraseCmd = (
  key: string,
  prev: PartTuple,
  host: () => PartsHost
): Command => ({
  label: "erase",
  do() {
    const h = host();
    h.parts.delete(key);
    h.markDirty();
  },
  undo() {
    const h = host();
    h.parts.set(key, prev);
    h.markDirty();
  },
});

/**
 * Replacing an occupied cell (e.g. recoloring) — one command so a single
 * undo restores the previous part rather than leaving the cell empty.
 */
export const replaceCmd = (
  key: string,
  next: PartTuple,
  prev: PartTuple,
  host: () => PartsHost
): Command => ({
  label: "replace",
  do() {
    const h = host();
    h.parts.set(key, next);
    h.markDirty();
  },
  undo() {
    const h = host();
    h.parts.set(key, prev);
    h.markDirty();
  },
});

/**
 * Minimal surface the prop commands need. Unlike the voxel Map, `props` is
 * ordinary zustand state — placements are discrete, user-paced actions (not
 * one edit per pointer-move), so there's no case here for the imperative,
 * outside-React pattern the parts Map needs. Each command replaces the array
 * rather than mutating it in place, so React (the prop browser, the
 * PivotControls-selected instance) re-renders normally.
 */
export interface PropsHost {
  props: PropInstance[];
  setProps(next: PropInstance[]): void;
  markDirty(): void;
}

export const addPropCmd = (
  instance: PropInstance,
  host: () => PropsHost
): Command => ({
  label: "add-prop",
  do() {
    const h = host();
    h.setProps([...h.props, instance]);
    h.markDirty();
  },
  undo() {
    const h = host();
    h.setProps(h.props.filter((p) => p !== instance));
    h.markDirty();
  },
});

export const removePropCmd = (
  instance: PropInstance,
  host: () => PropsHost
): Command => ({
  label: "remove-prop",
  do() {
    const h = host();
    h.setProps(h.props.filter((p) => p !== instance));
    h.markDirty();
  },
  undo() {
    const h = host();
    h.setProps([...h.props, instance]);
    h.markDirty();
  },
});

/**
 * Replaces one placed instance's transform (a PivotControls drag). Identifies
 * the instance by object reference rather than array index, so an undo/redo
 * elsewhere in the stack that changes the array's length can never make this
 * command patch the wrong element.
 */
export const movePropCmd = (
  prev: PropInstance,
  next: PropInstance,
  host: () => PropsHost
): Command => ({
  label: "move-prop",
  do() {
    const h = host();
    h.setProps(h.props.map((p) => (p === prev ? next : p)));
    h.markDirty();
  },
  undo() {
    const h = host();
    h.setProps(h.props.map((p) => (p === next ? prev : p)));
    h.markDirty();
  },
});

/** A paint drag wraps N cell mutations so one undo reverts the whole stroke. */
export const compositeCmd = (cmds: Command[]): Command => ({
  label: "composite",
  do() {
    for (const c of cmds) c.do();
  },
  undo() {
    // Reverse order: later edits may depend on earlier ones.
    for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo();
  },
});
