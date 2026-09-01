import type { PartTuple } from "./worlddoc";

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
export class CommandBus {
  private past: Command[] = [];
  private future: Command[] = [];
  private max = 200;

  execute(c: Command) {
    c.do();
    this.past.push(c);
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
  }

  undo() {
    const c = this.past.pop();
    if (!c) return;
    c.undo();
    this.future.push(c);
  }

  redo() {
    const c = this.future.pop();
    if (!c) return;
    c.do();
    this.past.push(c);
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
