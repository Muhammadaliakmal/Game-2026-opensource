import { z } from "zod";

export type Shape = 0 | 1 | 2 | 3; // 0=block, 1=slab, 2=ramp, 3=wedge
export type Vec3 = [number, number, number];
// tuple: [x, y, z, shape, colorIndex, finish, rot]  (rot 0..3 = 90° yaw steps)
export type PartTuple = [number, number, number, Shape, number, number, number];
export interface PropInstance {
  assetId: string;
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
}
export interface WorldDoc {
  v: 1;
  id: string;
  name: string;
  ownerId: string;
  spawn: Vec3;
  sky: number;
  parts: PartTuple[];
  props: PropInstance[];
}

// 32 hex swatches, index-addressed 0..31.
export const PALETTE: string[] = [
  "#f8fafc", "#e2e8f0", "#94a3b8", "#475569", "#1e293b", "#0f172a",
  "#fef08a", "#facc15", "#f59e0b", "#f97316", "#ea580c", "#dc2626",
  "#fca5a5", "#f472b6", "#ec4899", "#d946ef", "#a855f7", "#7c3aed",
  "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#10b981",
  "#22c55e", "#84cc16", "#a3e635", "#78350f", "#57534e", "#a8a29e",
  "#000000", "#ffffff",
];
export const FINISHES = ["matte", "glossy", "metal", "emissive"] as const;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const partTuple = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int().min(0).max(3), // shape
  z.number().int().min(0).max(31), // color index
  z.number().int().min(0).max(3), // finish
  z.number().int().min(0).max(3), // rot
]);
export const worldDocSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(80),
  ownerId: z.string(),
  spawn: vec3,
  sky: z.number().int().min(0),
  parts: z.array(partTuple).max(50000),
  props: z.array(
    z.object({ assetId: z.string(), pos: vec3, rot: vec3, scale: vec3 })
  ).max(2000),
});
export const parseWorldDoc = (u: unknown): WorldDoc =>
  worldDocSchema.parse(u) as WorldDoc;

/** A fresh, empty world for a new owner — starting point for `POST /api/worlds`. */
export function emptyWorldDoc(id: string, ownerId: string, name = "Untitled World"): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: [0, 1, 0],
    sky: 0,
    parts: [],
    props: [],
  };
}
