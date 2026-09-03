@AGENTS.md

# Blockworld

See `SPEC.md` for the full build plan. Work phase-by-phase. Never change pinned
dependency versions without checking in.

## Conventions

- Keep all `zustand` state **outside** the React render tree. Never use `useState`
  for editor part data.
- Do not run physics during editing — editor placement is integer-grid hash-map
  math only; Rapier runs in Play mode only.
- Store part color as a palette **index**, never a hex string.
- Never SSR the R3F canvas — always `dynamic(() => import(...), { ssr: false })`.
- Use tuples, not objects, for the `parts` payload.
- Render blocks via `InstancedMesh` (one per shape), not one mesh per block.
- React 19 / R3F v9 only. Never mix R3F v8 with React 19.

## Env

Secrets live in `.env.local` (gitignored): Clerk keys via `clerk env pull`,
Neon `DATABASE_URL` via `neon env pull`.

## Commands

- `npm run dev` — dev server
- `npm test` — unit tests (node:test via tsx)
- `npx drizzle-kit generate` / `npx drizzle-kit migrate` — schema migrations

## Room server (`server/`, Phase 5)

A separate Node process — Colyseus 0.18 + `@colyseus/schema` 5. It imports the
app's `src/lib/ops.ts` through a `@/*` path mapping rather than duplicating it,
which is why `keyOf` lives in `lib/cell-key.ts`: everything else in `lib/grid.ts`
pulls in three.js, and a headless server must not.

- `cd server && npm run dev` — room server on :2567 (`npm test` for its tests)
- See `server/.env.example` for everything it reads.

### Who may do what in a room (5d)

Two separate questions, answered in two different places, and conflating them
is the mistake to avoid:

- **Who are you** — `server/src/auth.ts`. A Clerk session token, verified with
  `CLERK_SECRET_KEY`. No token is a *guest*: they join, they appear, they race,
  and they cannot change anything anybody owns. `ALLOW_ANONYMOUS_ROOMS=1` is
  the local escape hatch that makes everyone an editor; nothing else fails open.
- **What may you do here** — `BuildRoom.canEdit`. The world's owner, and nobody
  else: there is no collaborator model in the data, so anything more generous
  would be inventing permissions the app cannot grant or revoke. Built-in worlds
  have no owner and no row to save into, so nobody edits those either.

`BuildRoom` uses the **instance** `onAuth`, not the static one — Colyseus
honours only one, and the ownership check needs the world, which does not exist
until `onCreate` has run.

### Saving (5d)

The room is authoritative once anyone joins, so the room is what saves. It has
no Neon credentials: it writes through `POST /api/worlds/:id/sync`, which is
guarded by `MULTIPLAYER_SECRET` and is invisible without it. Timing lives in
`server/src/persist.ts` — 5 s after the last edit, a 30 s ceiling so continuous
building still lands, and once more on dispose.

### Running anything multiplayer locally

Build rooms, matches and races are all no-ops until the app is pointed at a
room server, which is the default — so `/race/ABC234` will tell you it cannot
connect rather than opening a grid. Three things, all of them required:

1. `server/.env` (copy `server/.env.example`) with either `CLERK_SECRET_KEY`
   — the app's own — or `ALLOW_ANONYMOUS_ROOMS=1`. With neither, every join is
   refused with a 501.
2. `cd server && npm run dev`.
3. `NEXT_PUBLIC_MULTIPLAYER_URL=ws://localhost:2567` in `.env.local`, then
   restart `next dev` — it is a `NEXT_PUBLIC_` var, so it is read at build
   time and a running dev server will not pick it up.

To have local sessions actually save, add the same `MULTIPLAYER_SECRET` to both
`server/.env` and `.env.local`. Without it the room runs read-only against
public worlds: `/api/worlds/:id/sync` refuses it, so private worlds 404 on join
and no edit is ever written back.

### Deploying the room server

Vercel cannot host it: a room has to stay resident and a serverless function
does not. It needs somewhere that runs a persistent Node process with
WebSockets.

Two things constrain the deploy, both easy to get wrong:

- **Deploy from the repo root, not from `server/`.** The server imports
  `@/lib/race-track`, `@/lib/ops` and `@/lib/worlddoc` at *runtime* through the
  `@/*` -> `../src/*` mapping in `server/tsconfig.json`. `server/` on its own
  does not run.
- **`tsx` is a runtime dependency**, because `npm start` is `tsx src/index.ts`.
  It lives in `dependencies` for that reason; do not move it back.

Environment on the host:

- `PORT` — usually set by the platform; `index.ts` already reads it.
- `APP_URL` — the deployed Next app. The room reads and writes worlds through
  its `/api/worlds/:id/sync`, so this must be reachable from the server.
- `CLERK_SECRET_KEY` — the app's own key. The room verifies join tokens with
  it. Leave `ALLOW_ANONYMOUS_ROOMS` unset in any real deployment: it makes
  every client an editor of every world.
- `MULTIPLAYER_SECRET` — the same value as the app's. Rooms now write worlds
  back, and this is the only credential that lets them; without it a deployed
  room silently discards every session's edits.

Then point the app at it: `NEXT_PUBLIC_MULTIPLAYER_URL=wss://<host>` (note
`wss`, not `ws`, from an HTTPS page) and redeploy the app — build-time var.

### Fly.io

`server/Dockerfile` and `server/fly.toml` are checked in for this. The image
installs only `server/`'s own dependencies — every `@/lib/*` import the server
makes touches exactly one npm package (`zod`), already in `server/package.json`
— and copies `src/lib` alongside it, nothing else from the app.

The Docker build context has to be the **repo root**, not `server/`: Docker
cannot `COPY` across a build context boundary, and `src/lib` sits outside
`server/` on disk. That is also why the deploy command below is run from the
repo root rather than `cd server && fly deploy`.

```
fly auth login
fly apps create <your-unique-name>          # then set that name as `app` in server/fly.toml
fly deploy --config server/fly.toml --dockerfile server/Dockerfile .
fly secrets set --config server/fly.toml   APP_URL=https://your-app.vercel.app   CLERK_SECRET_KEY=sk_...   MULTIPLAYER_SECRET=...
```

`fly.toml` pins `min_machines_running = 1` and `auto_stop_machines = "off"`
deliberately: a room holds live `WorldSession` state and open sockets in
memory, and Fly's default scale-to-zero behaviour for stateless web services
is exactly how you drop every connected session without warning.

### Render.com

The no-card-required option — trades that for a free tier that sleeps after
15 minutes with nobody connected (the next join eats a 30-60 s cold start
while it wakes). `render.yaml` at the repo root is a Blueprint: New + ->
Blueprint in the Render dashboard, point it at this repo, and Render finds the
file. It reuses `server/Dockerfile` unchanged — `dockerContext: .` is the field
that makes the build context the repo root rather than `server/`, for the same
reason Fly's deploy command runs from the root.

Render prompts for `APP_URL`, `CLERK_SECRET_KEY` and `MULTIPLAYER_SECRET`
during the Blueprint setup wizard (they're `sync: false` in the file, which
means "not in git, ask the person deploying" rather than "optional").

To dodge the sleep: point a free uptime monitor (UptimeRobot, cron-job.org) at
the root URL every 5-10 minutes. The server already answers `GET /` with a
default 200 — nothing to add for this to work — and a monitored service that
never goes idle never sleeps.
