import { z } from "zod";
import {
  MAX_CHECKPOINTS,
  checkpoint,
  partTuple,
  propInstance,
  vec3,
  type Checkpoint,
  type PartTuple,
  type PropInstance,
  type Vec3,
  type WorldDoc,
} from "./worlddoc";
import {
  placeCmd,
  eraseCmd,
  replaceCmd,
  compositeCmd,
  addPropCmd,
  removePropCmd,
  movePropCmd,
  type Command,
  type PartsHost,
  type PropsHost,
} from "./command-bus";
import { keyOf } from "./cell-key";

/**
 * The serializable form of an edit — the actual network seam for Phase 5.
 *
 * SPEC §5 calls the command bus the seam, and it nearly is: the *shape* of an
 * edit is right there. But a `Command` is a pair of closures over a live host,
 * and closures do not go over a wire. An `Op` is the same edit as plain data;
 * `commandFor` turns one back into the very same `Command` on either side.
 *
 * Every op carries its own inverse (`prev`), which is what lets the server roll
 * one back and what lets undo work without replaying a world from the start.
 */
export type Op =
  | { t: "place"; key: string; part: PartTuple }
  | { t: "erase"; key: string; prev: PartTuple }
  | { t: "replace"; key: string; next: PartTuple; prev: PartTuple }
  | { t: "spawn"; prev: Vec3; next: Vec3 }
  /**
   * Moving, setting or clearing the finish.
   *
   * `null` rather than `undefined` for "no goal", because these go over a wire
   * as JSON and `JSON.stringify` deletes an undefined property rather than
   * encoding it — an op saying "clear the goal" would arrive as an op with no
   * `next` at all and fail its own schema.
   */
  | { t: "goal"; prev: Vec3 | null; next: Vec3 | null }
  /**
   * Inserting and removing a resume point, by position in the list.
   *
   * Index rather than value, because order is the whole meaning of a
   * checkpoint — `checkpoints.ts` reads "later in the course" straight off the
   * array — so an op that removed the matching *value* would let an undo put a
   * gate back in the wrong place. Carrying `cp` as well is what keeps that
   * honest: the remove verifies the value at the index before splicing it, and
   * falls back to a value search if two peers' indices have diverged. Two
   * people re-ordering one course's gates at the same moment can still end up
   * with an order neither chose — that is a list, not a grid, and last-write-
   * wins-per-cell has nothing to say about it. The failure is a wrong order,
   * never a corrupt document, and one of them can drag it back.
   */
  | { t: "cp-add"; index: number; cp: Checkpoint }
  | { t: "cp-remove"; index: number; cp: Checkpoint }
  | { t: "prop-add"; instance: PropInstance }
  | { t: "prop-remove"; instance: PropInstance }
  | { t: "prop-move"; prev: PropInstance; next: PropInstance }
  | { t: "composite"; ops: LeafOp[] };

export type LeafOp = Exclude<Op, { t: "composite" }>;

const cellKey = z.string().regex(/^-?\d+,-?\d+,-?\d+$/, 'key must be "x,y,z"');
const cpIndex = z.number().int().min(0).max(MAX_CHECKPOINTS - 1);

const leafOpSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("place"), key: cellKey, part: partTuple }),
  z.object({ t: z.literal("erase"), key: cellKey, prev: partTuple }),
  z.object({ t: z.literal("replace"), key: cellKey, next: partTuple, prev: partTuple }),
  z.object({ t: z.literal("spawn"), prev: vec3, next: vec3 }),
  z.object({ t: z.literal("goal"), prev: vec3.nullable(), next: vec3.nullable() }),
  // Bounded by the document's own cap: an index past it could never address a
  // checkpoint that is allowed to exist, so it is a malformed message.
  z.object({ t: z.literal("cp-add"), index: cpIndex, cp: checkpoint }),
  z.object({ t: z.literal("cp-remove"), index: cpIndex, cp: checkpoint }),
  z.object({ t: z.literal("prop-add"), instance: propInstance }),
  z.object({ t: z.literal("prop-remove"), instance: propInstance }),
  z.object({ t: z.literal("prop-move"), prev: propInstance, next: propInstance }),
]);

/**
 * A stroke is a flat list of cell edits, so composites never nest. Keeping the
 * message schema non-recursive is deliberate: a recursive wire type is a free
 * stack overflow for whoever runs the room server.
 */
const opUnion = z.union([
  leafOpSchema,
  z.object({
    t: z.literal("composite"),
    ops: z.array(leafOpSchema).min(1).max(4096),
  }),
]);

/**
 * A part carries its own x/y/z, and so does its key. If a peer sends a key that
 * disagrees with the tuple, the Map and the tuple describe different cells from
 * then on. Reject that rather than pick a winner.
 */
function checkKey(op: Op, ctx: z.RefinementCtx, path: (string | number)[] = []) {
  if (op.t === "composite") {
    op.ops.forEach((child, i) => checkKey(child, ctx, [...path, "ops", i]));
    return;
  }
  if (op.t !== "place" && op.t !== "erase" && op.t !== "replace") return;
  const part = op.t === "place" ? op.part : op.t === "erase" ? op.prev : op.next;
  if (keyOf(part[0], part[1], part[2]) !== op.key) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "key"],
      message: `key ${op.key} does not match part coordinates`,
    });
  }
}

export const opSchema = opUnion.superRefine((op, ctx) => checkKey(op as Op, ctx));

export const parseOp = (u: unknown): Op => opSchema.parse(u) as Op;

// --- applying ops to a world ----------------------------------------------

/**
 * The authoritative world as the room server holds it: parts keyed "x,y,z" so
 * an edit is O(1), exactly as the editor store holds them. A WorldDoc's `parts`
 * array is the wire and database form, not the working form.
 */
export interface WorldState {
  parts: Map<string, PartTuple>;
  props: PropInstance[];
  spawn: Vec3;
  /** Undefined for a world that is not a course. See WorldDoc.goal. */
  goal: Vec3 | undefined;
  /** Empty for a course with no resume points, which is most worlds. */
  checkpoints: Checkpoint[];
}

export function stateFromDoc(doc: WorldDoc): WorldState {
  const parts = new Map<string, PartTuple>();
  for (const p of doc.parts) parts.set(keyOf(p[0], p[1], p[2]), p);
  return {
    parts,
    props: [...doc.props],
    spawn: doc.spawn,
    goal: doc.goal,
    checkpoints: [...(doc.checkpoints ?? [])],
  };
}

export function docFromState(doc: WorldDoc, state: WorldState): WorldDoc {
  return {
    ...doc,
    parts: [...state.parts.values()],
    props: state.props,
    spawn: state.spawn,
    goal: state.goal,
    // Back to absent rather than an empty array, so a world that is not a
    // course keeps saying so instead of acquiring an empty course's shape.
    checkpoints: state.checkpoints.length > 0 ? state.checkpoints : undefined,
  };
}

/**
 * Where a checkpoint op's target actually is.
 *
 * The index is the answer whenever the value there still matches, which is
 * every local edit and every remote one that arrived in order. The value
 * search is the fallback for the case the index is stale — a peer removed a
 * gate ahead of this one between the message being sent and applied — where
 * deleting whatever now sits at that index would remove the wrong gate.
 */
function checkpointAtIndex(
  list: readonly Checkpoint[],
  index: number,
  cp: Checkpoint
): number {
  const same = (a: Checkpoint) =>
    a.yaw === cp.yaw && a.pos.every((v, i) => v === cp.pos[i]);
  if (index < list.length && same(list[index])) return index;
  return list.findIndex(same);
}

/** Value equality — the wire hands us structural copies, never the same object. */
export const sameInstance = (a: PropInstance, b: PropInstance) =>
  a.assetId === b.assetId &&
  a.pos.every((v, i) => v === b.pos[i]) &&
  a.rot.every((v, i) => v === b.rot[i]) &&
  a.scale.every((v, i) => v === b.scale[i]);

/** Applies an op in place. Last write wins per cell — correct for voxels. */
export function applyOp(state: WorldState, op: Op): WorldState {
  switch (op.t) {
    case "place":
      state.parts.set(op.key, op.part);
      break;
    case "erase":
      state.parts.delete(op.key);
      break;
    case "replace":
      state.parts.set(op.key, op.next);
      break;
    case "spawn":
      state.spawn = op.next;
      break;
    case "goal":
      state.goal = op.next ?? undefined;
      break;
    case "cp-add": {
      const next = [...state.checkpoints];
      // Clamped rather than rejected: an append is expressed as "insert at the
      // current length", and a peer whose list is one shorter than ours would
      // otherwise drop the gate entirely rather than put it at the end.
      next.splice(Math.min(op.index, next.length), 0, op.cp);
      state.checkpoints = next;
      break;
    }
    case "cp-remove": {
      const at = checkpointAtIndex(state.checkpoints, op.index, op.cp);
      if (at >= 0) state.checkpoints = state.checkpoints.filter((_, i) => i !== at);
      break;
    }
    case "prop-add":
      state.props = [...state.props, op.instance];
      break;
    case "prop-remove": {
      const i = state.props.findIndex((p) => sameInstance(p, op.instance));
      if (i >= 0) state.props = state.props.filter((_, j) => j !== i);
      break;
    }
    case "prop-move": {
      const i = state.props.findIndex((p) => sameInstance(p, op.prev));
      if (i >= 0) state.props = state.props.map((p, j) => (j === i ? op.next : p));
      break;
    }
    case "composite":
      for (const child of op.ops) applyOp(state, child);
      break;
  }
  return state;
}

/** The op that undoes this one — server-side rollback, and a free test oracle. */
export function invertOp(op: Op): Op {
  switch (op.t) {
    case "place":
      return { t: "erase", key: op.key, prev: op.part };
    case "erase":
      return { t: "place", key: op.key, part: op.prev };
    case "replace":
      return { t: "replace", key: op.key, next: op.prev, prev: op.next };
    case "spawn":
      return { t: "spawn", prev: op.next, next: op.prev };
    case "goal":
      return { t: "goal", prev: op.next, next: op.prev };
    case "cp-add":
      return { t: "cp-remove", index: op.index, cp: op.cp };
    case "cp-remove":
      return { t: "cp-add", index: op.index, cp: op.cp };
    case "prop-add":
      return { t: "prop-remove", instance: op.instance };
    case "prop-remove":
      return { t: "prop-add", instance: op.instance };
    case "prop-move":
      return { t: "prop-move", prev: op.next, next: op.prev };
    case "composite":
      // Reverse order: later edits may depend on earlier ones.
      return { t: "composite", ops: [...op.ops].reverse().map((c) => invertOp(c) as LeafOp) };
  }
}

// --- turning an op back into a Command ------------------------------------

/** Everything an op touches, resolved lazily so commands act on live state. */
export interface OpHost {
  parts(): PartsHost;
  props(): PropsHost;
  setSpawn(v: Vec3): void;
  setGoal(v: Vec3 | undefined): void;
  /** Read lazily, like every other host accessor — see the note on PartsHost. */
  checkpoints(): readonly Checkpoint[];
  setCheckpoints(v: Checkpoint[]): void;
  markDirty(): void;
}

/**
 * Prop commands identify an instance by object reference (see command-bus.ts),
 * which is right for local edits and impossible over a wire. Prefer the live
 * reference when we have it — that keeps local behaviour byte-identical — and
 * fall back to value matching for an instance that arrived as JSON.
 */
const resolve = (host: OpHost, wanted: PropInstance): PropInstance => {
  const live = host.props().props;
  return live.includes(wanted) ? wanted : (live.find((p) => sameInstance(p, wanted)) ?? wanted);
};

export function commandFor(op: Op, host: OpHost): Command {
  const parts = () => host.parts();
  const props = () => host.props();
  switch (op.t) {
    case "place":
      return placeCmd(op.key, op.part, parts);
    case "erase":
      return eraseCmd(op.key, op.prev, parts);
    case "replace":
      return replaceCmd(op.key, op.next, op.prev, parts);
    case "spawn":
      return {
        label: "spawn",
        do() {
          host.setSpawn(op.next);
          host.markDirty();
        },
        undo() {
          host.setSpawn(op.prev);
          host.markDirty();
        },
      };
    case "goal":
      return {
        label: "goal",
        do() {
          host.setGoal(op.next ?? undefined);
          host.markDirty();
        },
        undo() {
          host.setGoal(op.prev ?? undefined);
          host.markDirty();
        },
      };
    case "cp-add":
      return {
        label: "checkpoint-add",
        do() {
          const next = [...host.checkpoints()];
          next.splice(Math.min(op.index, next.length), 0, op.cp);
          host.setCheckpoints(next);
          host.markDirty();
        },
        undo() {
          const list = host.checkpoints();
          const at = checkpointAtIndex(list, op.index, op.cp);
          if (at >= 0) host.setCheckpoints(list.filter((_, i) => i !== at));
          host.markDirty();
        },
      };
    case "cp-remove":
      return {
        label: "checkpoint-remove",
        do() {
          const list = host.checkpoints();
          const at = checkpointAtIndex(list, op.index, op.cp);
          if (at >= 0) host.setCheckpoints(list.filter((_, i) => i !== at));
          host.markDirty();
        },
        undo() {
          const next = [...host.checkpoints()];
          next.splice(Math.min(op.index, next.length), 0, op.cp);
          host.setCheckpoints(next);
          host.markDirty();
        },
      };
    case "prop-add":
      return addPropCmd(op.instance, props);
    case "prop-remove":
      return removePropCmd(resolve(host, op.instance), props);
    case "prop-move":
      return movePropCmd(resolve(host, op.prev), op.next, props);
    case "composite":
      return compositeCmd(op.ops.map((c) => commandFor(c, host)));
  }
}
