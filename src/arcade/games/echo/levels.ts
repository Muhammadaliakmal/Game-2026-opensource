import { ROOM_H, ROOM_W } from "./tuning";

/**
 * The levels, by hand.
 *
 * Coordinates are room pixels — `ROOM_W` by `ROOM_H`, origin top-left, below
 * the HUD. The room's own edges are walls and are not listed.
 *
 * ── Each level is the last one plus one thing ────────────────────────────
 *
 * 1. One plate, one door. Teaches the loop: stand here, then walk there.
 * 2. Two plates in sequence, the second behind the first door. Teaches that
 *    ghosts stack.
 * 3. A patrol across the corridor. Teaches that a ghost is a *timed* thing:
 *    the run that holds the plate also has to have got past the guard.
 * 4. A door that closes while its plate is held. The ghost must hold and
 *    then *let go* — the "make your past self do the wrong thing" moment the
 *    pitch is built around.
 * 5. All of it, with three plates and two patrols.
 *
 * A level's `loops` is how many ghosts it allows. Run out and the cabinet
 * ends the run there: the score is what was cleared.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Plate {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface Door extends Rect {
  /** The plate that opens it. */
  plate: string;
  /** Open while the plate is *not* held. Level 4's whole idea. */
  inverted?: boolean;
}

export interface Patrol {
  /** Walked end to end and back, forever, from the start of every run. */
  path: Array<[number, number]>;
  /** Pixels per second. */
  speed: number;
  r: number;
}

export interface EchoLevel {
  name: string;
  /** One line under the name at the start. */
  hint: string;
  /** Seconds per run. */
  time: number;
  /** Ghosts allowed. */
  loops: number;
  spawn: [number, number];
  exit: Rect;
  walls: Rect[];
  plates: Plate[];
  doors: Door[];
  patrols: Patrol[];
}

/** A wall from the top edge to `gapTop`, and from `gapBottom` to the floor. */
function wallWithGap(x: number, gapTop: number, gapBottom: number, w = 20): Rect[] {
  return [
    { x, y: 0, w, h: gapTop },
    { x, y: gapBottom, w, h: ROOM_H - gapBottom },
  ];
}

const EXIT_W = 64;
const exitAt = (x: number, y: number): Rect => ({ x: x - EXIT_W / 2, y: y - EXIT_W / 2, w: EXIT_W, h: EXIT_W });

export const LEVELS: EchoLevel[] = [
  {
    name: "Hold the door",
    hint: "Stand on the plate. Next loop, your ghost will.",
    time: 10,
    loops: 3,
    spawn: [90, 250],
    exit: exitAt(860, 250),
    walls: [...wallWithGap(470, 200, 300)],
    plates: [{ id: "a", x: 250, y: 110, r: 30 }],
    doors: [{ x: 470, y: 200, w: 20, h: 100, plate: "a" }],
    patrols: [],
  },
  {
    name: "Two doors",
    hint: "Ghosts stack. Each loop gets one step further.",
    time: 10,
    loops: 4,
    spawn: [80, 420],
    exit: exitAt(870, 90),
    walls: [...wallWithGap(330, 180, 280), ...wallWithGap(650, 40, 140)],
    plates: [
      { id: "a", x: 150, y: 90, r: 30 },
      { id: "b", x: 490, y: 430, r: 30 },
    ],
    doors: [
      { x: 330, y: 180, w: 20, h: 100, plate: "a" },
      { x: 650, y: 40, w: 20, h: 100, plate: "b" },
    ],
    patrols: [],
  },
  {
    name: "Patrol",
    hint: "The guard resets with the loop. So does your timing.",
    time: 11,
    loops: 3,
    spawn: [80, 250],
    exit: exitAt(870, 250),
    walls: [...wallWithGap(560, 210, 290)],
    plates: [{ id: "a", x: 430, y: 80, r: 30 }],
    doors: [{ x: 560, y: 210, w: 20, h: 80, plate: "a" }],
    patrols: [
      { path: [[280, 40], [280, 460]], speed: 190, r: 16 },
      { path: [[700, 460], [700, 40]], speed: 150, r: 16 },
    ],
  },
  {
    name: "Let go",
    hint: "The far door shuts while the plate is held. Your ghost has to step off.",
    time: 11,
    loops: 4,
    spawn: [80, 250],
    exit: exitAt(880, 250),
    walls: [...wallWithGap(400, 200, 300), ...wallWithGap(720, 200, 300)],
    plates: [{ id: "a", x: 230, y: 100, r: 30 }],
    doors: [
      { x: 400, y: 200, w: 20, h: 100, plate: "a" },
      { x: 720, y: 200, w: 20, h: 100, plate: "a", inverted: true },
    ],
    patrols: [],
  },
  {
    name: "Orchestra",
    hint: "Three plates, two guards, five loops. Conduct.",
    time: 12,
    loops: 5,
    spawn: [70, 440],
    exit: exitAt(890, 60),
    walls: [
      ...wallWithGap(300, 320, 420),
      ...wallWithGap(600, 100, 200),
      ...wallWithGap(780, 60, 160),
    ],
    plates: [
      { id: "a", x: 120, y: 90, r: 28 },
      { id: "b", x: 450, y: 440, r: 28 },
      { id: "c", x: 700, y: 440, r: 28 },
    ],
    doors: [
      { x: 300, y: 320, w: 20, h: 100, plate: "a" },
      { x: 600, y: 100, w: 20, h: 100, plate: "b" },
      { x: 780, y: 60, w: 20, h: 100, plate: "c" },
    ],
    patrols: [
      { path: [[450, 60], [450, 300]], speed: 170, r: 16 },
      { path: [[690, 60], [690, 380]], speed: 210, r: 16 },
    ],
  },
];

/** Every wall of a level, with the room's own four edges folded in. */
export function solidWalls(level: EchoLevel): Rect[] {
  const T = 1000;
  return [
    ...level.walls,
    { x: -T, y: -T, w: ROOM_W + 2 * T, h: T },
    { x: -T, y: ROOM_H, w: ROOM_W + 2 * T, h: T },
    { x: -T, y: 0, w: T, h: ROOM_H },
    { x: ROOM_W, y: 0, w: T, h: ROOM_H },
  ];
}
