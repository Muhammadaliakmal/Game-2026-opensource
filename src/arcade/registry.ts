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
  /**
   * How you play it, said twice — once for a thumb and once for a keyboard.
   *
   * Not one string with both in it. "SPACE / TAP to jump" is the shape that
   * ships when nobody decides, and it is wrong on every device: a phone is
   * told about a key it does not have, and a desktop is told to tap. Which one
   * a screen shows is a `(pointer: coarse)` question answered at the point of
   * render — see `<ControlsHint>`.
   */
  hint: { touch: string; keys: string };
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
  /**
   * A turn-based cabinet: it reports a placement, not a score.
   *
   * The overlay reads it to decide whether to put a number in the corner. A
   * Ludo match has no running total — showing "0 · best 0" for four minutes is
   * a readout that is not merely useless but actively wrong about what the
   * player is doing. See `host/types.ts`'s `onPlaced`.
   */
  board?: boolean;
  load: () => Promise<{ default: GameModule }>;
}

export const ARCADE: ArcadeEntry[] = [
  {
    id: "chunk-runner",
    title: "Chunk Runner",
    tagline: "Don't stop. Don't blink.",
    hint: { touch: "Tap to jump · hold to glide", keys: "Space to jump · hold to glide" },
    // An endless runner is played in a forward lean, so it gets the quicker
    // pulse of the two.
    bpm: 148,
    load: () => import("./games/chunk-runner"),
  },
  {
    id: "tower-stack",
    title: "Tower Stack",
    tagline: "Perfect or nothing.",
    hint: { touch: "Tap to drop", keys: "Space to drop" },
    // Stacking is a game of waiting for one moment, and a track that hurries
    // the player into pressing is a track that costs them the perfect.
    bpm: 132,
    load: () => import("./games/tower-stack"),
  },
  {
    id: "ludo",
    title: "Ludo",
    tagline: "Four seats. One of them is yours.",
    hint: {
      touch: "Tap to roll · tap a piece to move",
      keys: "Space to roll · click a piece, or 1-4",
    },
    // Slower than either runner, and deliberately so: this is a game of
    // waiting for a six, and a track that hurries the table makes the waiting
    // worse rather than shorter.
    bpm: 104,
    board: true,
    load: () => import("./games/ludo"),
  },
  {
    id: "snakes",
    title: "Snakes & Ladders",
    tagline: "The board decides. The cards are yours.",
    hint: {
      touch: "Tap to roll · tap a card to spend it",
      keys: "Space to roll · 1-3 to spend a card",
    },
    // Between the runners and Ludo. The dice come round faster than Ludo's do
    // — one token, no yard to wait on — and the track should keep up with the
    // rolling rather than with the deliberating.
    bpm: 118,
    board: true,
    load: () => import("./games/snakes"),
  },
  {
    id: "echo",
    title: "ECHO",
    tagline: "Your last run is still in the room.",
    hint: {
      touch: "Drag anywhere to run · your past runs replay",
      keys: "WASD to run · your past runs replay",
    },
    // A room is run against a clock and then run again beside yourself, so
    // the pulse sits between the runners and the boards: urgent, not hurried.
    bpm: 124,
    load: () => import("./games/echo"),
  },
  {
    id: "gravity",
    title: "Gravity Shift",
    tagline: "Down is whichever way you say.",
    hint: {
      touch: "Tap a side of the ball to fall that way",
      keys: "Arrows to pick which way is down",
    },
    // Every flip is a decision and the fall after it is watched, so the
    // track keeps a walking pace and leaves the drama to the drop.
    bpm: 112,
    load: () => import("./games/gravity"),
  },
  {
    id: "bullet",
    title: "One Bullet",
    tagline: "One shot. Make it do everything.",
    hint: {
      touch: "Drag to aim · let go to fire",
      keys: "Arrows to aim · Shift for fine · Space to fire",
    },
    // Aiming is a held breath; the slowest tempo in the arcade, for the same
    // reason Ludo's is slow — a track that hurries the shot costs the room.
    bpm: 96,
    load: () => import("./games/bullet"),
  },
  {
    id: "swarm",
    title: "SwarmRush",
    tagline: "Eat. Grow. Don't get eaten.",
    hint: {
      touch: "Drag to steer · tap to dash · button to split",
      keys: "Mouse or WASD to steer · Space to dash · E to split",
    },
    // The fastest floor in the arcade: the doc asks for something to happen
    // every second or two, and the track is the first thing that does.
    bpm: 136,
    load: () => import("./games/swarm"),
  },
  {
    id: "reflex",
    title: "Reflex",
    tagline: "It appears. The ring closes. Go.",
    hint: {
      touch: "Tap the target before its ring closes",
      keys: "Click the target before its ring closes",
    },
    // Quick, and it stays quick: the cabinet has one verb and the track
    // should not pretend the late run is calmer than the early one.
    bpm: 128,
    load: () => import("./games/reflex"),
  },
  {
    id: "duel",
    title: "Ragdoll Rumble",
    tagline: "Two robots, one lava sea. Swing like you mean it.",
    hint: {
      touch: "Drag to move and swing · hold SKILL to wind up · JUMP",
      keys: "WASD to move and swing · hold F to wind up · Space to jump",
    },
    // A fight has a pulse of its own — swing, recover, swing — and a track
    // at a brisk walk sits under it without racing the exchanges.
    bpm: 140,
    load: () => import("./games/duel"),
  },
  {
    id: "stub",
    title: "Test Pattern",
    tagline: "A square, at exactly 200 pixels a second.",
    hint: {
      touch: "Nothing to press — this one proves the loop",
      keys: "Nothing to press — this one proves the loop",
    },
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
