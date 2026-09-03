# plan-phase5.md — Multiplayer retrofit (Colyseus)

Status: **shipped.** 5a `0ff6af3`, 5b `3d2f567`, 5c `51d89b3`, 5d `31adeba`. Verified
against the real stack (Neon, Clerk, `next dev`) on 2026-09-03 — see §5. The one
thing still not done here is the deploy: the room server is deployable
(`381c190`) but has not been deployed anywhere, so `NEXT_PUBLIC_MULTIPLAYER_URL`
is unset in production and the app runs exactly as it did before Phase 5.

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
| 5d | Auth, debounced persistence, env wiring. Deploy deferred — see the status note. |

Each step is a commit. 5a is worth doing on its own even if multiplayer stops there.

## 5. Acceptance criteria

Checked 2026-09-03 against `next dev` + real Neon + real Clerk, with the room
server on :2567. What each one actually showed:

| Criterion | Result |
|---|---|
| A block placed in A appears in B | Ops broadcast and apply; latency not measured with two real browsers. |
| Ctrl+Z undoes only your own edits | Covered by `editor-store.test.ts` — a remote op never enters the undo stack. |
| A malformed op is rejected and never broadcast | Yes, and forged keys and over-cap strokes with it (`world-session.test.ts`). |
| Everyone disconnects → the world reloads with every edit | Yes. Five placements in a real room became one debounced write into the real `worlds` row. |
| `NEXT_PUBLIC_MULTIPLAYER_URL` unset → unchanged | Yes. 95/95 app and 52/52 server tests pass with it unset. |
| 4 peers at 60 fps, no snapping | Not measured. Needs four real clients. |

Two things the checks above do **not** cover, both needing a browser:
frame-rate under peers, and a genuine Clerk session token mapping to the owner
(everything here was exercised as a guest, or with `ALLOW_ANONYMOUS_ROOMS=1`).

## 6. Known gotchas

- `@colyseus/schema` v5 requires the decorator/`defineTypes` form that matches the
  client version — pin `colyseus.js` to the 0.16-line that speaks 0.18's protocol and
  verify handshake before building on it.
- Do not put `parts` in schema state (encoder cost); ship it as one snapshot message.
- `tsx` + `verbatimModuleSyntax`: server is `"type": "module"`; use `.js` specifiers in
  relative imports or set `moduleResolution: "bundler"`.
- Rapier/ecctrl remain client-side; there is **no** server-authoritative movement in
  this phase — presence only. Anti-cheat is out of scope and should stay out.
