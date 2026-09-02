# plan-phase5.md — Multiplayer retrofit (Colyseus)

Status: **draft, awaiting approval.** Phases 0–4 are committed (`f4c76d0`). `server/`
exists with Colyseus 0.18 + `@colyseus/schema` 5 installed and an empty `src/`.

Per SPEC §12 Phase 5 this is a *retrofit*, not a rewrite: the command bus (§5) is the
seam. Nothing in Phases 0–4 changes shape; the app must keep working byte-identically
when multiplayer is switched off.

---

## 0. The one real design problem

`Command` (src/lib/command-bus.ts) is a pair of **closures** over a host getter. Closures
do not go over a wire. So the seam is not `Command` itself — it is a serializable **op**
that a factory turns into a `Command` on either side.

```ts
// src/lib/ops.ts  (new, shared by app and server)
export type Op =
  | { t: "place";   key: string; part: PartTuple }
  | { t: "erase";   key: string; prev: PartTuple }
  | { t: "replace"; key: string; next: PartTuple; prev: PartTuple }
  | { t: "prop-add" | "prop-remove"; instance: PropInstance }
  | { t: "prop-move"; prev: PropInstance; next: PropInstance }
  | { t: "composite"; ops: Op[] };

export const opSchema: z.ZodType<Op>          // zod, mirrors worlddoc.ts primitives
export const commandFor = (op: Op, host) => Command   // the existing *Cmd factories
export const applyOp = (doc: WorldDoc, op: Op) => WorldDoc   // pure, server-side
```

The existing `placeCmd`/`eraseCmd`/… stay exactly as they are; `commandFor` is a switch
that calls them. `editor-store.ts` stops constructing commands inline and instead builds
an `Op`, then hands it to a `dispatch(op)` that does two things: execute locally through
the bus (unchanged behaviour), and, if a room is connected, `room.send("op", op)`.

**Remote ops never enter the local undo stack.** A remote op is applied by calling
`commandFor(op, host).do()` directly, not `bus.execute(...)` — otherwise Ctrl+Z would
undo a stranger's edit, which is the classic collaborative-editor bug.

## 1. Server (`server/src/`)

```
server/src/
  index.ts        # colyseus Server + WebSocketTransport, PORT from env
  rooms/BuildRoom.ts
  state.ts        # @colyseus/schema: Player { id, name, x,y,z, yaw }
  auth.ts         # Clerk token verification (@clerk/backend verifyToken)
  persist.ts      # debounced write-back of the authoritative WorldDoc
  *.test.ts       # node:test
```

- **Room id = world id.** `onCreate` loads the WorldDoc from Neon (or via the app's API
  with a shared secret — see §3), holds it in a plain field (not `@colyseus/schema`; a
  50k-part voxel Map has no business being diffed by the schema encoder).
- **`onMessage("op")`**: `opSchema.parse` → reject invalid → `applyOp` the authoritative
  doc → `broadcast("op", op, { except: client })`. Last write wins per cell; that is
  correct for voxels and needs no OT/CRDT.
- **`onJoin`**: send the full WorldDoc as the initial snapshot, then stream ops.
- **`@colyseus/schema` state carries only presence**: one `Player` per client with
  position/yaw at ~10 Hz. This is what the schema encoder is good at.
- **Only signed-in users may join a build room, and only for a world they may edit.**
  `onAuth` verifies the Clerk token and re-checks ownership server-side — never trust a
  client-sent `ownerId`.
- **No chat, no free text, ever** (SPEC §10 / §1). Presence is display name + avatar
  only. Adding a text channel would drag in the moderation burden §12 explicitly
  declined for comments.

## 2. Client

- `colyseus.js` in the app; `src/lib/net/room.ts` owns the connection, `src/stores/net-store.ts`
  holds `{ status, peers }` outside the render tree, matching the editor-store pattern.
- Build mode: remote ops applied via `commandFor(...).do()` + `markDirty()`.
- Play mode: remote players rendered by reusing `CharacterModel` with a name tag;
  positions interpolated between the last two snapshots (never snapped).
- **Feature flag `NEXT_PUBLIC_MULTIPLAYER_URL`.** Unset (the Vercel default until the
  room server is deployed) = the app behaves exactly as it does today, no socket, no
  peers, no UI. This keeps the v1 acceptance criteria green throughout.

## 3. Persistence

The room, not the browser, is authoritative once anyone has joined. Write-back is
debounced (~5 s idle, and on `onDispose`) through `POST /api/worlds/:id/sync` guarded by
a shared `MULTIPLAYER_SECRET`, so the Neon credentials stay in one place and `server/`
does not grow a second copy of the Drizzle layer. `server/tsconfig.json` maps `@/*` to
`../src/*` so `ops.ts` / `worlddoc.ts` are imported, never duplicated.

## 4. Work order

| Step | Deliverable |
|---|---|
| 5a | `src/lib/ops.ts` + tests; refactor `editor-store.ts` to dispatch ops. **Zero behaviour change** — existing tests still pass. |
| 5b | Server: room, op validation, broadcast, presence schema, tests. Runs locally. |
| 5c | Client connection + remote op application in Build; peers in Play. |
| 5d | Auth, debounced persistence, deploy (Railway/Fly), env wiring. |

Each step is a commit. 5a is worth doing on its own even if multiplayer stops there.

## 5. Acceptance criteria

- Two browsers in one world: a block placed in A appears in B in <150 ms local.
- Ctrl+Z in A undoes only A's own edits, never B's.
- A malformed / out-of-range op is rejected by the server and never broadcast.
- Both clients disconnect → the world reloads from Neon with every edit present.
- `NEXT_PUBLIC_MULTIPLAYER_URL` unset → app and `npm test` are unchanged from today.
- Play mode with 4 peers holds 60 fps; remote avatars interpolate without snapping.

## 6. Known gotchas

- `@colyseus/schema` v5 requires the decorator/`defineTypes` form that matches the
  client version — pin `colyseus.js` to the 0.16-line that speaks 0.18's protocol and
  verify handshake before building on it.
- Do not put `parts` in schema state (encoder cost); ship it as one snapshot message.
- `tsx` + `verbatimModuleSyntax`: server is `"type": "module"`; use `.js` specifiers in
  relative imports or set `moduleResolution: "bundler"`.
- Rapier/ecctrl remain client-side; there is **no** server-authoritative movement in
  this phase — presence only. Anti-cheat is out of scope and should stay out.
