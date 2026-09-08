import type { GameModule } from "./host/types";

/**
 * Payout rates are NOT here. They live in `lib/arcade-payout.ts` so a server
 * route can read one without importing this file and, through it, every game
 * module's dynamic import.
 */

/**
 * Every cabinet in the arcade, and the only place a game is named.
 *
 * ── Lazy, and strictly so ────────────────────────────────────────────────
 *
 * `load` is a dynamic import and nothing here imports a game at module scope.
 * That is not tidiness: `matter-js` alone is ~80 kB gzipped, and a player who
 * never walks up to a cabinet would otherwise download it as part of the world
 * bundle. The overlay itself is loaded the same way — see `ArcadeOverlay`.
 *
 * Adding a game is one folder under `games/` and one row here.
 */
export interface ArcadeEntry {
  id: string;
  title: string;
  tagline: string;
  controlsHint: string;
  /** Hidden from the cabinet list. For the host's own test game. */
  dev?: boolean;
  load: () => Promise<{ default: GameModule }>;
}

export const ARCADE: ArcadeEntry[] = [
  {
    id: "chunk-runner",
    title: "Chunk Runner",
    tagline: "Don't stop. Don't blink.",
    controlsHint: "SPACE / TAP to jump · hold to glide",
    load: () => import("./games/chunk-runner"),
  },
  {
    id: "tower-stack",
    title: "Tower Stack",
    tagline: "Perfect or nothing.",
    controlsHint: "SPACE / TAP to drop",
    load: () => import("./games/tower-stack"),
  },
  {
    id: "stub",
    title: "Test Pattern",
    tagline: "A square, at exactly 200 pixels a second.",
    controlsHint: "Nothing to press — this one proves the loop",
    dev: true,
    load: () => import("./games/stub"),
  },
];

const BY_ID = new Map(ARCADE.map((e) => [e.id, e]));

/** The cabinets a player can actually walk up to. */
export const CABINETS = ARCADE.filter((e) => !e.dev);

export const entryFor = (id: string): ArcadeEntry | undefined => BY_ID.get(id);

export const isArcadeId = (id: unknown): id is string =>
  typeof id === "string" && BY_ID.has(id);
