/**
 * The MAP_V2 flag.
 *
 * MAP.md §1: do not delete the old look first. Build the new one alongside it
 * behind a flag, then switch. Both paths are live in the same build, and the
 * old one is what runs unless this is set.
 *
 * `NEXT_PUBLIC_` because it is read in the browser, which also means it is
 * baked at build time — a running `next dev` will not notice a change to
 * .env.local until it is restarted. That has caught people out with
 * NEXT_PUBLIC_MULTIPLAYER_URL already (see CLAUDE.md) and it will catch them
 * out with this.
 *
 * Read through this constant rather than touching process.env directly:
 * Next inlines the literal `process.env.NEXT_PUBLIC_MAP_V2` at build time and
 * only recognises it when it is written out in full, so a computed lookup
 * silently yields undefined.
 */
export const MAP_V2 = process.env.NEXT_PUBLIC_MAP_V2 === "1";
