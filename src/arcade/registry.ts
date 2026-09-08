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
  /**
   * Tempo of this cabinet's music, in BPM. Optional — `music.ts` has a default.
   *
   * A cabinet is allowed its own tempo and nothing else about the track,
   * because tempo is the one musical parameter a game genuinely has an opinion
   * about: a game you play in bursts wants a different pulse from one you play
   * in a held breath. Anything more than this belongs in the music, not spread
   * across the registry.
   */
  bpm?: number;
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
    // An endless runner is played in a forward lean, so it gets the quicker
    // pulse of the two.
    bpm: 148,
    load: () => import("./games/chunk-runner"),
  },
  {
    id: "tower-stack",
    title: "Tower Stack",
    tagline: "Perfect or nothing.",
    controlsHint: "SPACE / TAP to drop",
    // Stacking is a game of waiting for one moment, and a track that hurries
    // the player into pressing is a track that costs them the perfect.
    bpm: 132,
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
