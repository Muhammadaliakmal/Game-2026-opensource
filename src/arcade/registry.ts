import type { GameModule } from "./host/types";

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
   * Coins per point of score. The payout tuning knob, and the only number
   * that decides whether a game is worth playing for a reward — see
   * `lib/arcade-payout.ts`, where the rest of the rule lives.
   */
  coinsPerPoint: number;
  /** Hidden from the cabinet list. For the host's own test game. */
  dev?: boolean;
  load: () => Promise<{ default: GameModule }>;
}

export const ARCADE: ArcadeEntry[] = [
  {
    id: "stub",
    title: "Test Pattern",
    tagline: "A square, at exactly 200 pixels a second.",
    controlsHint: "Nothing to press — this one proves the loop",
    coinsPerPoint: 0,
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
