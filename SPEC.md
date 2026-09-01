# BUILD SPEC — "Blockworld": A Roblox-style UGC 3D World Builder
### Executable build document for Claude Code · Author target: Muhammad Ali Akmal (Full-Stack MERN + Agentic AI, Karachi) · Compiled Sept 1, 2026

---

## 0. AGENT INSTRUCTIONS (read first)
This document is the single source of truth. Save it as `SPEC.md` at repo root and create a `CLAUDE.md` that references it (`See SPEC.md for the full build plan. Work phase-by-phase. Never change pinned dependency versions without checking in.`).

- **First action:** enter **plan mode** (use Opus for planning, Sonnet for code). Do **not** write code yet. Produce a `plan-phaseN.md` per phase and get it approved before executing.
- **Work phase-by-phase.** Do not begin Phase N+1 until Phase N's acceptance criteria pass.
- **Stop and check in** after: (1) dependency install + `npm run dev` boots clean; (2) each phase's acceptance criteria; (3) any deviation from pinned versions or any library that appears broken.
- **Definition of done (v1):** a signed-in user builds a world with primitives + props, saves it to Neon, switches to Play mode, and walks around it with ecctrl — and the movement feels good per §8.
- Use a subagent only to scan the repo (Explore) during plan mode. Do **not** split planner→implementer→tester into separate agents — that "telephone game" handoff loses fidelity and is a documented anti-pattern. Keep work in the main thread unless context can be truly isolated.
- Keep all `zustand` state **outside** the React render tree. Never use `useState` for editor part data.

---

## 1. DO NOT DO THIS

**Engineering anti-patterns:**
- Do **not** run physics during editing. Editor placement is integer-grid hash-map math only; Rapier runs in Play mode only.
- Do **not** store part color as hex — use a palette **index**.
- Do **not** re-render R3F on every edit via React state. Mutate zustand + update instance matrices imperatively.
- Do **not** SSR the canvas. Always `dynamic(() => import(...), { ssr:false })`.
- Do **not** use objects for the `parts` payload — use tuples.
- Do **not** render one mesh per block — use `InstancedMesh`.
- Do **not** generate one Rapier collider per block — greedy-mesh them into boxes.
- Do **not** use React 18 / R3F v8. This stack is React 19 / R3F v9 only (see §2 landmine).
- Multiplayer, mobile/touch, and in-browser AI generation are **OUT** of v1.

**PROHIBITED ENGAGEMENT MECHANICS — do not build (legal + ethical):** No loot boxes / randomized paid rewards; no variable-ratio ("slot-machine") reward schedules; no daily-login streaks built on loss-aversion; no artificial-scarcity / FOMO countdown timers; no energy/stamina "wait-or-pay" systems; no social-pressure notifications ("your friends are playing"); no confusing/counterintuitive purchase flows. **Reason:** this genre skews to minors, and these are the exact mechanics the FTC penalized (see §10) and that the UK Children's Code prohibits. Build *compelling craft* — game feel, a satisfying creative loop, near-instant respawn — instead. This is a hard constraint, not a preference.

---

## 2. VERIFIED DEPENDENCIES (late 2026) + ONE INSTALL COMMAND

Verified current stable versions (npm/GitHub, Sept 2026):

| Package | Pin | Notes |
|---|---|---|
| next | 16.3.x (16.3.3 Active LTS) | 16 is current stable major; 15.5.x is Maintenance LTS |
| react / react-dom | 19.2.x (19.2.7 latest patch) | React 19 is current; no React 20 announced |
| three | 0.185.1 | |
| @react-three/fiber | ^9.7.0 | **v9 pairs with React 19; v8 pairs with React 18** |
| @react-three/drei | ^10 | v10 pairs with R3F v9 |
| @react-three/rapier | ^2.2.0 | **v2 supports R3F v9 + React 19; v1 is React 18 only** |
| ecctrl | ^2.0.0 | Major rewrite (~Aug 2026); requires React 19 / R3F v9 / rapier ≥2 / three ≥0.177 |
| zustand | ^5 | |
| drizzle-orm + drizzle-kit | latest | |
| @neondatabase/serverless | latest | |
| @clerk/nextjs | ^7.8.0 | Requires Next ≥15.2.8, React ≥18, Node ≥20.9 |
| tailwindcss | ^4 | CSS-first: `@import "tailwindcss"` + `@tailwindcss/postcss`; no `tailwind.config.js` |
| @gltf-transform/cli | 4.4.2 (global) | Offline asset pipeline |

**Peer-dependency landmine (the #1 way this session thrashes):** the 2024-era failure "Next.js 15 + React 19 breaks React Three Fiber" (`TypeError: Cannot read properties of undefined (reading 'ReactCurrentOwner')`, tracked as vercel/next.js#71836 and pmndrs/react-three-fiber#3222) is resolved **only on R3F v9+**. R3F's own docs state plainly: `@react-three/fiber@8 pairs with react@18, @react-three/fiber@9 pairs with react@19`. `@react-three/rapier` v2's README: *"v2 has been released, which adds support for @react-three/fiber v9 and react v19. If you are using react v18, you will need to use @react-three/rapier v1 and @react-three/fiber v8."* Never mix R3F v8 with React 19. ecctrl 2.0.0 hard-requires React 19 / R3F v9 / rapier ≥2. ecctrl's shipped TypeScript types have historically thrown `tsc` errors (issues #12/#96/#130) — keep `skipLibCheck: true`.

```bash
npx create-next-app@latest blockworld --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd blockworld
npm i three@0.185.1 @react-three/fiber@^9.7.0 @react-three/drei@^10 @react-three/rapier@^2.2.0 ecctrl@^2.0.0 zustand@^5 drizzle-orm @neondatabase/serverless @clerk/nextjs@^7.8.0 @aws-sdk/client-s3 @aws-sdk/s3-request-presigner zod nanoid
npm i -D drizzle-kit @types/three dotenv tsx
npm i -g @gltf-transform/cli
```

---

## 3. FILE / FOLDER TREE
```
blockworld/
  CLAUDE.md              # points to SPEC.md + conventions
  SPEC.md                # this document
  drizzle.config.ts
  src/
    app/
      layout.tsx                 # ClerkProvider
      page.tsx                   # world browser (Phase 4)
      build/[id]/page.tsx        # dynamic import EditorCanvas ssr:false
      play/[id]/page.tsx         # dynamic import PlayCanvas ssr:false
      api/worlds/route.ts        # GET list, POST create
      api/worlds/[id]/route.ts   # GET/PUT/DELETE
      api/upload/route.ts        # R2 presigned URL
    lib/
      worlddoc.ts        # frozen type + zod validator + palette
      command-bus.ts     # undo/redo
      grid.ts            # raycast-to-cell + hashing
      greedy-mesh.ts     # collider generation
      feel.ts            # GAME FEEL config object
      r2.ts              # S3-compatible client
      db/{index.ts, schema.ts}
    stores/{editor-store.ts, play-store.ts}   # zustand, outside render tree
    components/
      editor/{EditorCanvas,InstancedParts,GhostPreview,Grid,Palette,Toolbar}.tsx
      play/{PlayCanvas,Player,WorldColliders}.tsx
      play/feel/{ScreenShake,LandingSquash,JumpParticles,useJumpFeel}.tsx
  scripts/{blender_batch.py, meshy_batch.ts}
  public/
    draco/               # DRACOLoader decoder files (REQUIRED path)
    props/               # optimized .glb catalog (dev copies)
```

---

## 4. WorldDoc TYPE + VALIDATOR (`lib/worlddoc.ts`)
```ts
import { z } from "zod";
export type Shape = 0 | 1 | 2 | 3;          // 0=block, 1=slab, 2=ramp, 3=wedge
export type Vec3 = [number, number, number];
// tuple: [x, y, z, shape, colorIndex, finish, rot]  (rot 0..3 = 90° yaw steps)
export type PartTuple = [number, number, number, Shape, number, number, number];
export interface PropInstance { assetId: string; pos: Vec3; rot: Vec3; scale: Vec3; }
export interface WorldDoc {
  v: 1; id: string; name: string; ownerId: string;
  spawn: Vec3; sky: number;
  parts: PartTuple[];
  props: PropInstance[];
}
export const PALETTE: string[] = [ /* 32 hex swatches, index-addressed 0..31 */ ];
export const FINISHES = ["matte","glossy","metal","emissive"] as const;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const partTuple = z.tuple([
  z.number().int(), z.number().int(), z.number().int(),
  z.number().int().min(0).max(3),   // shape
  z.number().int().min(0).max(31),  // color index
  z.number().int().min(0).max(3),   // finish
  z.number().int().min(0).max(3),   // rot
]);
export const worldDocSchema = z.object({
  v: z.literal(1), id: z.string(), name: z.string().min(1).max(80),
  ownerId: z.string(), spawn: vec3, sky: z.number().int().min(0),
  parts: z.array(partTuple).max(50000),
  props: z.array(z.object({ assetId: z.string(), pos: vec3, rot: vec3, scale: vec3 })).max(2000),
});
export const parseWorldDoc = (u: unknown): WorldDoc => worldDocSchema.parse(u) as WorldDoc;
```
The tuple payload keeps a 10k-part world at roughly 200 KB of JSON. The `parts` cap of 50k is a soft ceiling — surface a part-counter warning well before it. The shape is technically sound; nothing about it is unwise. (One optional future-proofing note: if you ever want palettes to be per-world editable, keep the palette in the WorldDoc; for v1 a global palette indexed by the tuple is correct and smaller.)

---

## 5. COMMAND BUS + UNDO/REDO (`lib/command-bus.ts`)
```ts
export interface Command { do(): void; undo(): void; label: string; }
export class CommandBus {
  private past: Command[] = []; private future: Command[] = [];
  private max = 200;
  execute(c: Command) { c.do(); this.past.push(c); if (this.past.length > this.max) this.past.shift(); this.future = []; }
  undo() { const c = this.past.pop(); if (!c) return; c.undo(); this.future.push(c); }
  redo() { const c = this.future.pop(); if (!c) return; c.do(); this.past.push(c); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
// Commands mutate the zustand parts Map directly, then flag the instanced renderer dirty.
export const placeCmd = (key: string, part: PartTuple, store: any): Command => ({
  label: "place",
  do()  { store.getState().parts.set(key, part); store.getState().markDirty(); },
  undo(){ store.getState().parts.delete(key);      store.getState().markDirty(); },
});
export const eraseCmd = (key: string, prev: PartTuple, store: any): Command => ({
  label: "erase",
  do()  { store.getState().parts.delete(key);      store.getState().markDirty(); },
  undo(){ store.getState().parts.set(key, prev);    store.getState().markDirty(); },
});
// A "paint drag" wraps N cell mutations in one composite Command so one undo reverts the whole stroke.
export const compositeCmd = (cmds: Command[]): Command => ({
  label: "composite",
  do()  { for (const c of cmds) c.do(); },
  undo(){ for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(); },
});
```
Parts live in a `Map<string, PartTuple>` keyed by `"x,y,z"`. Placement and erase are O(1). **This command bus is also the network seam for Phase 5** — the same Commands become the messages a Colyseus room broadcasts, so multiplayer is a retrofit rather than a rewrite.

---

## 6. DRIZZLE SCHEMA (`lib/db/schema.ts`)
```ts
import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import type { WorldDoc } from "@/lib/worlddoc";
export const worlds = pgTable("worlds", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull(),               // Clerk user id
  name: text("name").notNull(),
  doc: jsonb("doc").$type<WorldDoc>().notNull(),      // typed JSONB column
  thumbnailUrl: text("thumbnail_url"),
  published: integer("published").default(0).notNull(),
  playCount: integer("play_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ ownerIdx: index("owner_idx").on(t.ownerId), pubIdx: index("pub_idx").on(t.published) }));
export type World = typeof worlds.$inferSelect;
export type NewWorld = typeof worlds.$inferInsert;
```
```ts
// lib/db/index.ts  — app code (Vercel serverless / edge): HTTP driver
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```
**Driver choice:** use `drizzle-orm/neon-http` + `neon()` for app reads/writes on Vercel (HTTP, no long-lived TCP, no pooling headaches). Use `drizzle-orm/neon-serverless` (WebSocket `Pool`, with `neonConfig.webSocketConstructor = ws`) **only** for seed/transaction scripts. Note: `@neondatabase/serverless` cannot talk to a plain local Postgres — for offline dev, either point at a Neon branch or run the Neon local proxy. Migrations: `npx drizzle-kit generate` then `npx drizzle-kit migrate` (use `push` in dev). Query the WorldDoc with `db.select().from(worlds).where(eq(worlds.id, id))`; `doc` is a fully typed JSONB column.

---

## 7. HARD-PARTS CODE

### 7.1 R3F Canvas mount in App Router
```tsx
// app/build/[id]/page.tsx  (Server Component)
import dynamic from "next/dynamic";
const EditorCanvas = dynamic(() => import("@/components/editor/EditorCanvas"), { ssr: false });
export default function Page({ params }: { params: { id: string } }) {
  return <EditorCanvas worldId={params.id} />;
}
```
```tsx
// components/editor/EditorCanvas.tsx
"use client";
import { Canvas } from "@react-three/fiber";
export default function EditorCanvas({ worldId }: { worldId: string }) {
  return (
    <Canvas frameloop="demand" camera={{ position: [12, 12, 12], fov: 50 }}
            gl={{ powerPreference: "high-performance" }}>
      {/* scene */}
    </Canvas>
  );
}
```
**Gotchas:** Use `frameloop="demand"` in the editor and call `invalidate()` on edits to save GPU. The Canvas component **must** be `'use client'` **and** dynamically imported with `ssr:false`, or you get "Canvas must be a client component" + hydration errors. To keep **one** WebGL context alive across `/build → /play`, the robust pattern is to mount a single Canvas in a shared layout and swap scene children by state (the `react-three-next` starter demonstrates a canvas that "is not getting unmounted while navigating between pages"). A full route change between two separate Canvases destroys and recreates the GL context (a visible flash / context-loss risk). For v1 simplicity, two routes are acceptable **if** you dispose geometries/materials on unmount.

### 7.2 Raycast to integer grid cell (Minecraft place-on-face) (`lib/grid.ts`)
```ts
import * as THREE from "three";
export const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

// intersection.point + face normal → the empty cell adjacent to the hit face
export function cellFromHit(hit: THREE.Intersection, place: boolean): [number, number, number] {
  const p = hit.point.clone();
  const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
  // For InstancedMesh the geometry normal is in the BASE geometry's local space:
  if (hit.instanceId != null && hit.object instanceof THREE.InstancedMesh) {
    const m = new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, m);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    n.applyMatrix3(nm).normalize();
  }
  p.addScaledVector(n, place ? 0.5 : -0.5); // OUT along normal to place, INTO the cell to erase
  return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)]; // integer cell (origin = cell min-corner)
}
```
**Sharp edge:** raycasting an `InstancedMesh` returns `hit.instanceId` and `hit.object` is the whole InstancedMesh, not a per-block object (three.js added instanced raycast support in PR #17961; the `Intersection.instanceId` field is documented). Critically, the `hit.face.normal` is in the **base geometry's local space** — you must transform it by that instance's normal matrix (above) before using it for adjacency, or a rotated slab/ramp/wedge will place on the wrong face. Also: after you mutate or add instance matrices you must set `instanceMatrix.needsUpdate = true` **and** call `computeBoundingSphere()`, or the raycaster silently misses moved instances (three.js #29349; discourse thread 53791: "Raycast fails after modifying the instance matrices").

### 7.3 Instanced renderer (`components/editor/InstancedParts.tsx`)
```tsx
"use client";
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE } from "@/lib/worlddoc";
const MAX = 50000;
const dummy = new THREE.Object3D();
const col = new THREE.Color();
export function InstancedParts({ shape, geometry }: { shape: number; geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dirty = useEditorStore(s => s.dirtyTick); // bump this in markDirty()
  useEffect(() => {
    const mesh = ref.current; let i = 0;
    for (const [, p] of useEditorStore.getState().parts) {
      if (p[3] !== shape) continue;
      dummy.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
      dummy.rotation.y = p[6] * Math.PI / 2;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.set(PALETTE[p[4]]));
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dirty, shape, geometry]);
  return <instancedMesh ref={ref} args={[geometry, undefined, MAX]} frustumCulled={false} />;
}
```
**Best practice:** prefer raw `THREE.InstancedMesh` with imperative matrix writes over drei's `<Instances>/<Instance>` for the grid, because reconciling thousands of `<Instance>` React nodes per edit is exactly the re-render trap that keeping state in zustand is meant to avoid. One InstancedMesh **per shape** → 4 draw calls for the whole world. Set `frustumCulled={false}` on the world instanced mesh (its bounding sphere spans the map; per-instance culling isn't automatic). Practical target: keep the whole scene under ~100–200 draw calls. drei's `<Instances>` is fine for the **static props catalog**, where instances rarely change.

### 7.4 Greedy-meshing collider generator (`lib/greedy-mesh.ts`)
Purpose: merge contiguous solid grid cells into a handful of big box colliders so Rapier isn't fed thousands of cuboids. This adapts the canonical voxel greedy-meshing idea (scan slices, merge coplanar cells into the largest possible rectangles) to emit **box volumes** for physics rather than render quads.
```ts
// Returns AABB boxes {min:[x,y,z], size:[w,h,d]} covering all solid cells.
export function greedyBoxes(solid: Set<string>): { min: [number,number,number]; size: [number,number,number] }[] {
  const has  = (x:number,y:number,z:number) => solid.has(`${x},${y},${z}`);
  const done = new Set<string>();
  const out: { min:[number,number,number]; size:[number,number,number] }[] = [];
  for (const key of solid) {
    if (done.has(key)) continue;
    const [x, y, z] = key.split(",").map(Number);
    const free = (i:number,j:number,k:number) => has(i,j,k) && !done.has(`${i},${j},${k}`);
    // grow +X
    let w = 1; while (free(x+w, y, z)) w++;
    // grow +Y across the whole width
    let h = 1;
    outerY: while (true) { for (let i=0;i<w;i++) if (!free(x+i, y+h, z)) break outerY; h++; }
    // grow +Z across the whole w×h slab
    let d = 1;
    outerZ: while (true) { for (let i=0;i<w;i++) for (let j=0;j<h;j++) if (!free(x+i, y+j, z+d)) break outerZ; d++; }
    for (let i=0;i<w;i++) for (let j=0;j<h;j++) for (let k=0;k<d;k++) done.add(`${x+i},${y+j},${z+k}`);
    out.push({ min:[x,y,z], size:[w,h,d] });
  }
  return out;
}
```
This is a 3D box-merge (greedy in X, then Y, then Z) that reduces thousands of cells to typically tens of boxes for blocky builds. Only cubic `block` shapes go through box-merging; `slab/ramp/wedge` each get their own convex-hull or trimesh collider (there are far fewer of them). The reference approach — build an occupancy mask, merge exposed regions into the largest rectangles, emit one primitive per merged region — is well documented (binary-greedy-meshing, vercidium's meshing writeups).

### 7.5 Rapier colliders + ecctrl 2.0 (`components/play/PlayCanvas.tsx`) — Phase 2
```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { KeyboardControls } from "@react-three/drei";
import { Ecctrl } from "ecctrl";
import { FEEL } from "@/lib/feel";
const map = [
  { name:"forward",  keys:["ArrowUp","KeyW"] },  { name:"backward", keys:["ArrowDown","KeyS"] },
  { name:"leftward", keys:["ArrowLeft","KeyA"] }, { name:"rightward",keys:["ArrowRight","KeyD"] },
  { name:"jump",     keys:["Space"] },            { name:"run",      keys:["Shift"] },
];
export default function PlayCanvas({ boxes, spawn }: { boxes: any[]; spawn: [number,number,number] }) {
  return (
    <Canvas shadows camera={{ fov: 65 }} gl={{ preserveDrawingBuffer: true }}>
      <Physics timeStep="vary">
        <KeyboardControls map={map}>
          <Ecctrl
            position={spawn}
            capsuleRadius={0.3} capsuleHalfHeight={0.3}
            maxWalkVel={FEEL.walkSpeed} maxRunVel={FEEL.runSpeed}
            jumpVel={FEEL.jumpVel} airDragFactor={FEEL.airControl}
            fallingGravityScale={FEEL.fallGravityScale} fallingMaxVel={FEEL.maxFallSpeed}
            floatHeight={0.2} springK={80} dampingC={6}
            groundDetection="shapeCast"
          >
            {/* <CharacterModel /> — glb goes here */}
          </Ecctrl>
        </KeyboardControls>
        {boxes.map((b, i) => (
          <RigidBody key={i} type="fixed" colliders="cuboid"
            position={[b.min[0]+b.size[0]/2, b.min[1]+b.size[1]/2, b.min[2]+b.size[2]/2]}>
            <mesh scale={b.size as any}><boxGeometry /><meshStandardMaterial /></mesh>
          </RigidBody>
        ))}
      </Physics>
    </Canvas>
  );
}
```
**ecctrl 2.0.0 API — verified against `pmndrs/ecctrl` `main` (`readme.md` + `docs/api-reference.md`, which states it targets `ecctrl@2.0.0`):**

- **Named import** `import { Ecctrl } from "ecctrl"` — v1 used a default export. This is a breaking change.
- `EcctrlProps` **extends Rapier `RigidBodyProps`** (so you can also pass `position`, `friction`, `gravityScale`, `enabledRotations`, etc.). Verified props + defaults:
  - Movement: `maxWalkVel` (2), `maxRunVel` (5), `accDeltaTime` (0.2), `decDeltaTime` (0.2), `airDragFactor` (0.1 — air control), `enableToggleRun` (true).
  - Jump: `jumpVel` (5), `jumpDuration` (0.1), `slopeJumpFactor` (0).
  - Falling: `fallingGravityScale` (3), `fallingMaxVel` (20).
  - Floating capsule: `floatHeight` (0.2), `springK` (80), `dampingC` (6). `capsuleHalfHeight` (0.3), `capsuleRadius` (0.3).
  - Ground: `groundDetection="shapeCast"` (default) | `"rayCast"`; `slopeMaxAngle` (Math.PI/2.5); `rayHitForgiveness` (0.28) — **this is the step/gap tolerance; there is NO explicit `stepHeight` prop in v2** (v1's step behavior is now emergent from ShapeCast + forgiveness). Balance: `autoBalance` (true).
- **Ref `EcctrlHandle`** exposes live runtime state you drive game-feel FX from: `isOnGround`, `isFalling`, `isMoving`, `moveSpeed`, `verticalSpeed`, `runActive`, `jumpActive`, `currPos` (a mutating `THREE.Vector3` — clone before storing), `body`, `collider`; plus methods `setMovement(partial)`, `setLockForward(bool)`, `setForwardDir(vec3)`.
- **Animation** (`import { EcctrlAnimationStateController, useEcctrlAnimationStore } from "ecctrl/animation"`): the v1 `<EcctrlAnimation>` component is gone. Wire `EcctrlAnimationStateController` (props: `ecctrl` ref, `enabled`, `resolver`, `onChange`) and read `useEcctrlAnimationStore`. State names are UPPERCASE: `IDLE | WALK | RUN | JUMP_START | JUMP_IDLE | JUMP_FALL | JUMP_LAND`. Map those to your glb clip names via drei's `useAnimations`/`useGLTF`.
- **Camera changed in v2 (biggest migration surprise):** the follow-camera is **no longer built into `<Ecctrl>`** — v1's `mode` (`"CameraBasedMovement"`/`"FixedCamera"`/`"PointToMove"`), `camInitDis`, `camMaxDis`, `camMinDis` props are removed. Use the separate `ecctrl/camera` module (`EcctrlCameraControls`, which wraps drei's `CameraControls`); it does **not** auto-follow — you drive the follow target each frame from `ecctrl.current.currPos`, and set zoom distance via drei `CameraControls` `minDistance`/`maxDistance`. First-person vs third-person is achieved through that distance range; there is no first-person flag. **Budget explicit time for the camera.**
- **Peer deps (hard):** React ≥19.1, `@react-three/fiber` ≥9, `@react-three/rapier` ≥2.0, `three` ≥0.177 (0.184+ recommended). Must live inside `<Physics>`. `<KeyboardControls>` (drei) is the standard input path but is optional (you can drive `setMovement`).
- **Maintenance:** actively maintained under pmndrs; v2 is only weeks old with ~54 open issues (mostly v1-era) and a companion project `BVHEcctrl`. **Fallback if ecctrl v2 misbehaves with your Rapier build:** first pin `@react-three/rapier@2.2.0` + `three@0.185.1`; if still broken, the escape hatch is Rapier's own `KinematicCharacterController` from `@dimforge/rapier3d-compat` — stable and battle-tested, but you must write your own float/step/camera logic. Do not silently downgrade to ecctrl v1, because that would force the whole stack back to React 18 / R3F v8.

### 7.6 Game-feel layer — coyote time, jump buffer, variable jump (`components/play/feel/useJumpFeel.ts`)
```ts
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { FEEL } from "@/lib/feel";
export function useJumpFeel(
  handleRef: any,
  jumpHeld: () => boolean,
  jumpPressedEdge: () => boolean,
) {
  const coyote = useRef(0), buffer = useRef(0);
  useFrame((_, dt) => {
    const h = handleRef.current; if (!h) return;
    // coyote time: keep a jump window open briefly after leaving ground
    coyote.current = h.isOnGround ? FEEL.coyoteTime : Math.max(0, coyote.current - dt);
    // jump buffer: remember an early press briefly so it fires on landing
    buffer.current = jumpPressedEdge() ? FEEL.jumpBuffer : Math.max(0, buffer.current - dt);
    if (buffer.current > 0 && coyote.current > 0) {
      h.setMovement({ jump: true });
      buffer.current = 0; coyote.current = 0;
    }
    // variable jump height: cut upward velocity when the button is released early
    if (!jumpHeld() && h.verticalSpeed > 0) {
      const v = h.body.linvel();
      h.body.setLinvel({ x: v.x, y: v.y * FEEL.jumpCutMultiplier, z: v.z }, true);
    }
  });
}
```
Companion FX components, all driven off `EcctrlHandle` edges: **camera lag** (lerp the follow target toward `currPos` at `FEEL.camLag`) + **lookahead** (offset target by velocity × `FEEL.camLookahead`); **landing squash** (on `isOnGround` rising edge scale the model to `FEEL.squashScale`, spring back over `FEEL.squashRecover`); **screen shake** (on a hard land, `|verticalSpeed| > FEEL.hardLandVel`, shake camera at `FEEL.shakeAmp`/`shakeFreq` for `FEEL.shakeDur`); **jump/land particle burst** and pooled WebAudio footstep/impact SFX. These "screenshake / squash-stretch / particle-on-impact" techniques are the concrete craft from the game-feel canon (Steve Swink's *Game Feel*; Jan Willem Nijman / Vlambeer's "The Art of Screenshake," which walks through stacking exactly these juice layers onto a plain shooter).

---

## 8. GAME FEEL PARAMETERS (`lib/feel.ts`) — the single tunable config
All times in seconds; frame references assume 60 fps. **Wire this whole object to `leva` in dev so it can be tuned live.**
```ts
export const FEEL = {
  // --- Movement ---
  walkSpeed: 2.5,          // → ecctrl maxWalkVel
  runSpeed: 5.0,           // → ecctrl maxRunVel
  airControl: 0.15,        // → ecctrl airDragFactor (higher = more steering in air)
  accelTime: 0.12,         // reach target speed fast, not instant
  decelTime: 0.10,         // crisp stop
  // --- Jump ---
  jumpVel: 5.5,            // → ecctrl jumpVel
  coyoteTime: 0.083,       // 5 frames @60fps — Celeste's published value
  jumpBuffer: 0.083,       // 5 frames — Celeste's published value
  inputBuffer: 0.083,      // 5 frames — Celeste buffers unavailable actions ~5 frames
  jumpCutMultiplier: 0.45, // variable jump height: cut vertical vel on early release
  fallGravityScale: 3.0,   // fall faster than rise = snappy arc (biggest single "feel" lever)
  maxFallSpeed: 20,
  // --- Camera ---
  camLag: 0.12,            // follow lerp factor (lower = smoother/laggier)
  camLookahead: 0.35,      // world units of velocity-based lookahead
  // --- Juice ---
  squashScale: [1.18, 0.82, 1.18] as [number,number,number],
  squashRecover: 0.18,
  landStretch: [0.85, 1.20, 0.85] as [number,number,number],
  hardLandVel: 9,          // |verticalSpeed| above this triggers shake + big squash
  shakeAmp: 0.12, shakeDur: 0.12, shakeFreq: 30,
  hitStop: 0.05,           // optional freeze-frames on hard impact
  // --- Respawn (obby loop) ---
  respawnDelay: 0.25,      // near-instant (Super Meat Boy philosophy)
  fallOutY: -20,           // below this → respawn at spawn
  // --- Placement feedback (editor) ---
  placePunchScale: 1.15,   // block "punch" pop on placement
  placePunchTime: 0.10,
} as const;
```
**Reasoning, with sources:** Celeste ships **5 frames (~0.083 s) of coyote time and 5 frames of jump buffering**, both confirmed by the Celeste Wiki and by designer **Maddy Thorson's "Celeste & Forgiveness"** writeup: *"1. Coyote Time — you can still jump for a short time after leaving a ledge. 2. Jump Buffering — if you press and hold the jump button a short time before landing, you will jump on the exact frame that you land,"* the whole point being that *"everything is fudged a tiny bit in the player's favor… it wants you to succeed."* Super Meat Boy uses a comparable coyote window. **Variable jump height** (cut upward velocity on early release) gives the player a controllable arc and is a platformer staple. **Asymmetric gravity** (`fallGravityScale 3`, fall faster than you rise) is the single biggest "snappy" lever. **Camera lag + velocity lookahead** comes straight from the game-feel literature (Swink; Vlambeer). **Near-instant respawn (~0.25 s)** is the canonical Super Meat Boy / Celeste retention mechanic — Team Meat's design intent was that respawn be shaved to almost nothing so the player is immediately back in the action *(this specific framing is widely attributed to Team Meat/Edmund McMillen but the exact wording circulates without a clean primary citation — treat it as design lore, not a verified quote; the near-instant-respawn behavior itself is well documented across Super Meat Boy 3D coverage as "under half a second").*

> **This `FEEL` object is the single highest-leverage artifact in the entire build.** For a UGC platform, if third-person movement feels bad, nothing else matters — players never reach the creative loop. Implement and tune it *first* in Phase 2, live, before adding any content.

---

## 9. ENGAGEMENT FEATURES MAPPED TO PHASES (prioritized; woven in, not bolted on)

**#1 — HIGHEST LEVERAGE — Game feel (Phase 2).** The `FEEL` layer (§7.6/§8). *Acceptance:* a blind playtester describes movement as "tight"/"good" unprompted. This gates everything downstream.

**#2 — The creative/placement loop (Phase 1).** Immediate visual feedback: the ghost preview snaps to the grid cell every frame; placement is satisfying — a `placePunchScale` pop + a short click SFX + a subtle particle. **Low floor:** a block is placeable within seconds of load. **High ceiling:** 4 shapes × 4 rotations × 32 colors × 4 finishes is deep combinatorial space. Townscaper is the case study: creator **Oskar Stålberg** deliberately removed goals and score — *"When you can win, you play to win. When you keep score, you play to the score… I wanted the visuals and the joy of creation to be the whole point"* (PC Gamer); its own tagline is *"No goal. No real gameplay."* Constraints (one clean contextual action) drive creativity. *Target:* time-to-first-satisfying-creation under ~60 s. *Acceptance:* placing 20 blocks feels good and never stutters.

**#3 — The obby/platformer loop (Phase 2).** Near-instant respawn (`respawnDelay 0.25`), fall-out detection (`fallOutY`), a spawn point. Failure cost near-zero → the "just one more try" pull. Optional checkpoint parts can be deferred past v1. *Acceptance:* fall out → back in control in <0.3 s with no load screen.

**#4 — The sharing loop (Phase 4).** Cheap + high value: shareable play-by-link URL, canvas-captured thumbnail, a public play count. **Remix/fork** (clone the WorldDoc row into the viewer's account) is cheap and is the strongest UGC retention driver — build it. **Traps to avoid as a solo dev:** live comments (moderation + child-safety liability) and real-time featured feeds (ops burden). *Acceptance:* copy link → anyone can play; "Remix" duplicates the world into their account.

**#5 — First-session design (mostly Phase 4; minimal in Phase 1).** Start a new world from a **small template** (a floating platform + a couple of props), never a blank void — blank-canvas paralysis is a known drop-off point. Use light discovery onboarding (a one-line hint), not a forced tutorial. *Acceptance:* a new user places something within 60 s.

---

## 10. LEGAL / REGULATORY BOUNDARY (requirement 11f — build this understanding into the product)
This is a constraint on the feature set, not background reading.

- **COPPA (US), amended rule.** The FTC finalized the first COPPA overhaul since 2013 on **April 22, 2025** (effective June 23, 2025; full-compliance deadline **April 22, 2026**, now in force — and an explicit FTC enforcement "key focus" for 2026). "Personal information" now includes **biometric identifiers** (fingerprints, faceprints, voiceprints, gait, DNA) and government IDs; operators must obtain **separate verifiable parental consent** before disclosing under-13 data to third parties (including advertisers and AI-training systems); **indefinite data retention is banned.** The FTC declined to add a dedicated "engagement" rule but expressly reaffirmed it will pursue *"unfair or deceptive practices encouraging harmful prolonged use"* under FTC Act §5.
- **Epic Games / Fortnite (Dec 19, 2022) — the direct precedent.** Per the FTC press release, Epic paid **$520M total: a record $275M civil penalty for COPPA violations** (largest ever for an FTC rule violation) **plus $245M in refunds for "dark patterns"** — specifically a *"counterintuitive, inconsistent, and confusing button configuration"* that charged users on loading/wake screens, while Epic *"ignored more than one million user complaints"* and locked the accounts of users who disputed charges. The order also added first-of-its-kind privacy protections for teens 13–17 and default-off voice/text for minors. This case is exactly why the prohibited-mechanics list in §1 exists.
- **UK Age Appropriate Design Code ("Children's Code," ICO), in force since Sept 2, 2021.** 15 standards; covers all under-18s; applies to any service *"likely to be accessed by children"* in the UK regardless of where you are based. Standard 13 (nudge techniques) prohibits dark-pattern nudges; Standard 5 prohibits "detrimental use of data"; requires high-privacy defaults and no profiling/geolocation by default. It explicitly names *"sticky" features — reward loops, auto-play, notifications* — as things to avoid where they harm children.
- **California AADC** frames the same behaviors as "dark patterns," explicitly citing *"rewards for time spent"* and *"notifications"* as engagement-extending harms.
- **EU Digital Services Act (DSA).** Bans dark-pattern interface design and prohibits targeted advertising to minors; interfaces must not deceive or manipulate. The EDPB dark-pattern guidelines apply.
- **Loot boxes specifically.** The UK government (DCMS) reviewed loot boxes and leans on the AADC to police them. Several EU states treat paid randomized rewards as gambling-adjacent: **Belgium's Gaming Commission declared paid loot boxes illegal gambling in 2018** (criminal exposure with fines up to €800,000, prompting several publishers to pull the feature), and the **Netherlands fined EA €10M in 2020** over FIFA packs (later overturned on appeal).

**Practical rules baked into this build:** collect the minimum data (Clerk handles auth; do not collect biometrics; do not profile; default worlds private); ship compelling *craft* (feel, creative loop, fast respawn); ship **none** of the prohibited retention mechanics. If monetization ever happens: no randomized paid rewards, and no confusing or asymmetric purchase flows.

---

## 11. ASSET PIPELINE (Phase 3 — prepared offline, ahead of time)

### 11.1 Meshy (verified late 2026)
- **Model choice:** use **Smart Topology (meshy-t2)** for game props — a Smart-Topology Text-to-3D preview is **5 credits** (vs 20 for Meshy-6) and produces clean triangle topology with natively separated parts and a settable `target_polycount` (100–15,000, default 4,000). That is ideal for low-poly catalog props.
- **Credit model** (preview → refine): Meshy-6 Text-to-3D preview = **20 cr**; refine/texture = **10 cr** (2k/4k) or **15 cr** (8k); Meshy-7 Image-to-3D = **25 cr**; Remesh = 5 cr; convert/resize = 1 cr.
- **Plans/limits:** Free = 100 cr/mo, but Meshy-6 output is **not downloadable on Free**; **Pro = $20/mo, 1,000 cr**, unlimited downloads, private/commercial rights, API access. The **API wallet is purchased separately** from subscription credits. Pro rate limit: 20 RPS, 10 queued tasks.
- **Build the pipeline against the test key first:** `msy_dummy_api_key_for_test_mode_12345678` returns mock results and consumes no credits.
- Raw output is high-poly (tens of thousands of triangles) unless you use Smart Topology / `target_polycount`; **always** run every asset through the Blender + gltf-transform pass below.
- **MCP servers:** verify the current install/name/tier of `@meshy-ai/meshy-mcp-server` in the Meshy docs at build time (package name/tier can drift). The Blender MCP server is `ahujasid/blender-mcp`, typically run via `uvx blender-mcp` with the companion Blender addon enabled.

### 11.2 Blender batch (`scripts/blender_batch.py`, run headless: `blender -b -P scripts/blender_batch.py`)
For each raw GLB in an input folder: (1) **decimate** to a triangle budget (~2–5k tris/prop) via a `DECIMATE` modifier; (2) **normalize scale** to fit a 1-unit bounding box uniformly; (3) **set origin to base-center** so props sit on the grid floor when placed (`origin_set` then shift Z to the base); (4) **join meshes + bake to a single material/atlas**; (5) export with `bpy.ops.export_scene.gltf(...)`.

### 11.3 gltf-transform (`@gltf-transform/cli` 4.4.2)
```bash
gltf-transform inspect in.glb                        # inspect triangle/texture budget first
gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp --texture-size 1024
```
Draco typically shrinks geometry by 90%+. **DRACOLoader decoder files must be hosted at a real path** or GLB load silently fails — copy the decoder into `public/draco/` and in R3F load via drei's `useGLTF(url, "/draco/")` (drei wires DRACOLoader for you when you pass the decoder path). *Target:* each catalog GLB under ~200 KB.

### 11.4 Cloudflare R2 (`lib/r2.ts` + `app/api/upload/route.ts`)
S3-compatible via `@aws-sdk/client-s3`: `endpoint: https://<accountid>.r2.cloudflarestorage.com`, `region: "auto"`, R2 access key/secret. Generate **presigned PUT** URLs with `@aws-sdk/s3-request-presigner`'s `getSignedUrl(...)` for uploads; serve **public reads** via a `pub-*.r2.dev` domain or a custom domain. Configure bucket **CORS** to allow `PUT` from your Vercel origin and `GET` for `*`, or presigned PUTs fail with an opaque error. Set `ContentType: "model/gltf-binary"` on Draco GLB uploads plus a long `Cache-Control`, so the browser and DRACOLoader read them correctly.

---

## 12. PER-PHASE TASK BREAKDOWN + ACCEPTANCE CRITERIA

### PHASE 0 — Scaffold
**Tasks:** run create-next-app + install (§2); Clerk provider + sign-in; Neon project + `DATABASE_URL`; Drizzle schema + first migration (`generate` → `migrate`); R2 bucket + keys + CORS; deploy to Vercel; commit `SPEC.md` + `CLAUDE.md`; implement `lib/worlddoc.ts` + `parseWorldDoc` with a unit test.
**Acceptance:** `npm run dev` boots with zero console errors; sign-in works; migration creates the `worlds` table; a `POST /api/worlds` creates a row with a valid empty WorldDoc; a Vercel preview deploys; `parseWorldDoc` rejects a malformed doc.

### PHASE 1 — Editor
**Tasks:** dynamic client Canvas (§7.1); orbit camera (drei `OrbitControls`); ground grid + axes; raycast-to-cell (`cellFromHit`, §7.2); ghost preview mesh tracking the cursor cell; place/erase via CommandBus (§5); 4 procedural shapes (block/slab/ramp/wedge geometries); 32-color palette + 4 finishes (mapped to material params); yaw rotation (0–3); undo/redo (Ctrl+Z / Ctrl+Y); save (`PUT` WorldDoc) + load; part counter; placement juice (`placePunchScale` + SFX).
**Acceptance:** place/erase 500 blocks with no frame drop; undo/redo 50 steps is correct; all 4 shapes + rotation place correctly on faces (including instanced-normal correctness from §7.2); save → reload restores the exact world; part counter is accurate; placement feels satisfying.

### PHASE 2 — Runtime (Play)
**Tasks:** `greedyBoxes` collider generation (§7.4); `<Physics>` + fixed RigidBodies from boxes; ecctrl 2.0 player (§7.5); `ecctrl/camera` follow-cam; spawn point; fall-out respawn (`fallOutY`, `respawnDelay`); editor↔play toggle that preserves the world; the full `FEEL` layer (coyote, buffer, variable jump, camera lag/lookahead, landing squash, screen shake, particles, SFX); leva bindings on `FEEL` in dev.
**Acceptance:** the character walks/jumps on the built geometry and never falls through merged colliders; greedy meshing reduces a 2k-block world to <100 colliders; fall-out respawns in <0.3 s; movement passes the "feels tight" blind test; toggling play/build never loses the world or leaks a WebGL context.

### PHASE 3 — Props
**Tasks:** run the offline Meshy → Blender → gltf-transform pipeline to produce ~20–40 optimized Draco GLBs uploaded to R2; in-editor prop browser (thumbnails); free-transform placement (translate/rotate/scale via drei `PivotControls`); per-prop AABB box-collider approximation fed into Play physics.
**Acceptance:** props load from R2 with Draco decoding; place/move/scale a prop and it persists in `props[]`; each placed prop has a walkable box collider in Play; each catalog GLB is <200 KB.

### PHASE 4 — Publish / Browse (summary)
Publish flag; canvas thumbnail via `gl.domElement.toDataURL()` → R2 (note `preserveDrawingBuffer` requirement in §13); world browser (grid of published worlds + play count); play-by-link; **remix/fork** (clone the WorldDoc row to a new owner). New worlds start from a template, not blank. **No comments in v1** (moderation + child-safety burden).

### PHASE 5 — Multiplayer retrofit (summary)
The data layer is already network-shaped: WorldDoc + the command bus (§5) = replicable ops. Stand up a **Colyseus** room on Railway/Fly.io; broadcast placement Commands as messages; the server holds the authoritative WorldDoc; sync ecctrl positions. The command bus is the seam that makes this a retrofit, not a rewrite.

---

## 13. KNOWN GOTCHAS (per phase — from real reported issues, not speculation)

- **P0 / all:** R3F v8 + React 19 is broken (the `ReactCurrentOwner` crash, next.js#71836 / r3f#3222) — use R3F v9, which fixes it. ecctrl's shipped types can throw `tsc` errors (issues #12/#96/#130) → set `skipLibCheck: true`.
- **P1:** InstancedMesh raycast returns `instanceId`, not a sub-object; you must transform the hit face normal by the instance normal-matrix (§7.2) or rotated shapes place on the wrong face. After moving/adding instances, set `instanceMatrix.needsUpdate = true` **and** call `computeBoundingSphere()`, or raycasts silently miss (three.js #29349; discourse 53791). Set `frustumCulled={false}` on the world instanced mesh or it can vanish when its origin leaves the frustum.
- **P2:** ecctrl v2 removed the built-in follow-cam (`mode`/`camInitDis` are gone) — you must use `ecctrl/camera` + drei `CameraControls`. ecctrl defaults are tuned for `density ≈ 1`; retune `springK`/`dampingC` if you change body mass. `Physics timeStep="vary"` reduces tunneling on frame spikes; if physics jitters, try a fixed step. Rapier ShapeCast is not supported on voxel-shape colliders — we use cuboids, so this is fine.
- **P3:** DRACOLoader needs decoder files at a real hosted path (`/draco/`) or GLB loads fail silently. R2 CORS must allow your origin or presigned PUT fails opaquely. Meshy raw output is high-poly — never skip the decimate pass.
- **P4:** `toDataURL()` returns a blank image unless the Canvas is created with `gl={{ preserveDrawingBuffer: true }}` (or you render-and-capture in the same frame).

---

## 14. FIRST-HOUR SESSION PLAN (maximum momentum)
**Attempt in hour one:**
1. **(0–10 min)** Plan mode: read `SPEC.md`, generate `plan-phase0.md`, approve it. (Plan mode is read-only — it cannot write files or run state-changing commands; use it to lock the approach first.)
2. **(10–30 min)** Phase 0 scaffold: create-next-app, install the pinned deps, boot `npm run dev` clean, commit. **Checkpoint.**
3. **(30–45 min)** `lib/worlddoc.ts` + zod validator + one passing test; Drizzle schema + `drizzle-kit generate` / `migrate` against Neon.
4. **(45–60 min)** Wire Clerk sign-in and a stub `/build/[id]` route that dynamically mounts an empty R3F Canvas rendering just a grid — this proves the single hardest integration (Canvas-in-App-Router behind auth) end to end.

**Explicitly DEFER out of hour one:** all physics/ecctrl, greedy meshing, the props pipeline, R2 uploads, and publish/browse.

**Rationale:** hour one must de-risk the two things most likely to thrash the whole session — a dependency/version mismatch, and the R3F-Canvas-in-App-Router mount. Getting a grid on screen, behind auth, committed and deployed, *before* touching gameplay, is the highest-momentum possible start.

---
*Version facts verified against npm/GitHub (three 0.185.1; @react-three/fiber 9.7.0; @react-three/rapier 2.2.0; ecctrl 2.0.0 via pmndrs `readme.md` + `docs/api-reference.md`; Next.js 16.3.x; @clerk/nextjs 7.8.0; drei v10; @gltf-transform/cli 4.4.2; Tailwind v4). Game-feel values from the Celeste Wiki and Maddy Thorson's "Celeste & Forgiveness"; respawn philosophy from Super Meat Boy (Team Meat) coverage. Creative-loop analysis from Oskar Stålberg via PC Gamer and Townscaper materials. Legal claims from FTC.gov (Epic $520M / COPPA), COPPA-amendment analyses (Loeb, Davis Polk, Latham), the UK ICO Children's Code, the EU DSA, and Belgium/Netherlands loot-box actions. Meshy credits/limits from Meshy's official docs.*