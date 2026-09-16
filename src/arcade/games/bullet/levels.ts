/**
 * The rooms, by hand.
 *
 * 24 columns by 12 rows. `#` wall, `.` air, `T` the turret, `E` a target,
 * `/` and `\` mirrors, `X` glass, `S` a switch, `D` a shut door, `d` an
 * open one, `C` a crate, `B` a charge.
 *
 * `window` is how many of the 1440 aim angles the test sweeps clear the
 * room — the size of the solution, and so how hard the room is. The test
 * holds each room to at least the window written here, so a room that
 * quietly becomes a pixel hunt fails the suite.
 *
 * ── The ladder ───────────────────────────────────────────────────────────
 *
 * 1  A wall in the way. The first bounce.
 * 2  Mirrors: the shot turns a corner it could not bounce round.
 * 3  Glass: through it, and the room behind it.
 * 4  A switch and a door. The order is the puzzle.
 * 5  A crate onto a switch: the shot does not throw the switch, the thing
 *    it shoves does.
 * 6  A charge among the targets.
 * 7  Everything, in a chain.
 */

export interface BulletLevel {
  name: string;
  hint: string;
  rows: string[];
  /** Starting aim, radians. Default 0 (right). */
  aim?: number;
  /** Bounces the shot has in this room. Walls, switches and crates count. */
  bounces: number;
  /** Minimum count of the 1440 swept angles that clear the room. */
  window: number;
}

export const LEVELS: BulletLevel[] = [
  {
    name: "Bank",
    hint: "The wall in the way is not in the way of a bounce.",
    bounces: 1,
    rows: [
      "########################",
      "#......................#",
      "#......................#",
      "#......................#",
      "#..........#...........#",
      "#..........#...........#",
      "#.T........#........E..#",
      "#..........#...........#",
      "#..........#...........#",
      "#......................#",
      "#......................#",
      "########################",
    ],
    window: 20,
  },
  {
    name: "Mirrors",
    hint: "A mirror turns the shot a quarter turn, and costs nothing.",
    bounces: 0,
    rows: [
      "########################",
      "#......................#",
      "#.T..........\\.........#",
      "#......................#",
      "#############..#########",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#############..#########",
      "#..E........./.........#",
      "########################",
    ],
    window: 10,
  },
  {
    name: "Glass",
    hint: "Glass is not a wall. It is a wall that used to be there.",
    bounces: 1,
    rows: [
      "########################",
      "#......................#",
      "#......X...............#",
      "#......X...............#",
      "#......X...............#",
      "#..T...X....E.....E....#",
      "#......X...............#",
      "#......X...............#",
      "#......X...............#",
      "#......X...............#",
      "#......................#",
      "########################",
    ],
    window: 10,
  },
  {
    name: "Switch",
    hint: "The switch opens the door. The mirrors bring the shot back.",
    bounces: 1,
    rows: [
      "########################",
      "#......................#",
      "#/.T..........S........#",
      "#......................#",
      "#.....##################",
      "#\\....D........E.......#",
      "#.....##################",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "########################",
    ],
    window: 10,
  },
  {
    name: "Shove",
    hint: "The shot does not throw the switch. What it shoves does.",
    bounces: 1,
    rows: [
      "########################",
      "#......................#",
      "#/.T.........CS........#",
      "#......................#",
      "#.....##################",
      "#\\....D........E.......#",
      "#.....##################",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "########################",
    ],
    window: 10,
  },
  {
    name: "Charge",
    hint: "A charge takes everything beside it. One shot cannot reach four.",
    bounces: 1,
    rows: [
      "########################",
      "#..............#.......#",
      "#..T...........#.......#",
      "#..............#.......#",
      "#..............#.......#",
      "#..............#.......#",
      "#......................#",
      "#................E.E...#",
      "#.................B....#",
      "#................E.E...#",
      "#......................#",
      "########################",
    ],
    window: 10,
  },
  {
    name: "Chain",
    hint: "Glass, switch, mirror, door, mirror, charge. One shot.",
    bounces: 2,
    rows: [
      "########################",
      "#......................#",
      "#/.T.....X.............S",
      "#........X.............#",
      "#........X.............#",
      "#........X.............#",
      "#........X.............#",
      "#D######################",
      "#......................#",
      "#\\....E...EBE..........#",
      "#......................#",
      "########################",
    ],
    window: 6,
  },
];
