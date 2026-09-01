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
