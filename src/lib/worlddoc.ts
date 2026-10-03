import { z } from "zod";
import { MAX_TEXTURE, FINISHES, MAX_CHECKPOINTS, type WorldDoc } from "./worlddoc-core";

/**
 * The world document: everything in worlddoc-core plus the zod schema that
 * validates one. Server routes, the editor and the room parse with this;
 * anything that only needs a type or a constant can import worlddoc-core and
 * leave zod out of its bundle.
 */
export * from "./worlddoc-core";

export const vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const partTuple = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int().min(0).max(3), // shape
  z.number().int().min(0).max(31), // color index
  z.number().int().min(0).max(FINISHES.length - 1), // finish
  z.number().int().min(0).max(3), // rot
  z.number().int().min(0).max(MAX_TEXTURE).optional(), // texture (see PartTuple)
]);
export const propInstance = z.object({
  assetId: z.string(),
  pos: vec3,
  rot: vec3,
  scale: vec3,
});
export const checkpoint = z.object({ pos: vec3, yaw: z.number() });
export const worldDocSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(80),
  ownerId: z.string(),
  spawn: vec3,
  spawnYaw: z.number().finite().optional(),
  goal: vec3.optional(),
  // Capped low on purpose: a course with more than this many resume points is
  // not a course, and the cap is what stops a crafted doc filling the play
  // scene with detection zones.
  checkpoints: z.array(checkpoint).max(MAX_CHECKPOINTS).optional(),
  sky: z.number().int().min(0),
  parts: z.array(partTuple).max(50000),
  props: z.array(propInstance).max(2000),
});
export const parseWorldDoc = (u: unknown): WorldDoc =>
  worldDocSchema.parse(u) as WorldDoc;
