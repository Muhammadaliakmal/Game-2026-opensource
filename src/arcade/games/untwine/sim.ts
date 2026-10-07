import { DX, DY, levelBoard, rayOf, type Board } from "./generate";
import * as T from "./tuning";

/**
 * Untwine's state and rules. Everything that changes happens in `step` or
 * in the two inputs (`tapCell`, `hint`); the renderer only reads.
 *
 * ── A line's place on its own path ──────────────────────────────────────
 *
 * Every line gets a path: its cells tail to head, then the cells of its
 * exit, then a few cells past the edge to slide off into. The line occupies
 * the stretch `[s, s + len - 1]` of that path, and `s` is the only thing an
 * animation moves — a pull runs `s` up the path until the line is gone, a
 * bump runs it toward the blocker and back. The body follows the head round
 * every bend for free, because the path already bends.
 *
 * ── Removed on the tap, drawn until it is gone ──────────────────────────
 *
 * A pulled line stops existing for the rules the instant it is tapped, so a
 * player who taps quickly is never blocked by a line still on its way out.
 * It is only drawn until its slide finishes.
 */

export type Phase = "intro" | "play" | "clear" | "lost" | "done";

export type SimEvent =
  | { type: "pull"; id: number; chain: number }
  | { type: "exit"; id: number }
  | { type: "bump"; id: number; blocker: number }
  | { type: "heartLost"; hearts: number }
  | { type: "heal" }
  | { type: "hint"; id: number }
  | { type: "clear"; bonus: number }
  | { type: "lost" }
  | { type: "deal" };

export interface LineState {
  /** Tail → head → exit → beyond, as cell coordinates (centres at +0.5). */
  path: Array<[number, number]>;
  len: number;
  /** Cells from the head to the grid edge. */
  exitLen: number;
  present: boolean;
  /** Still on screen: present, or sliding off. */
  drawn: boolean;
  s: number;
  v: number;
  /** A blocked tap: seconds into the bump, and how far it runs. */
  bumpT: number;
  bumpTo: number;
  flash: number;
  exited: boolean;
  /** When this line pops in at the start of the board, seconds. */
  appearAt: number;
}

export interface Sim {
  readonly board: Board;
  readonly lines: readonly LineState[];
  readonly level: number;
  readonly hearts: number;
  readonly score: number;
  readonly chain: number;
  readonly phase: Phase;
  /** Seconds in the current phase. */
  readonly phaseT: number;
  readonly hintId: number;
  readonly hintT: number;
  readonly hintsLeft: number;
  readonly mistakes: number;
  /** The heart lost most recently, and when, for its little shake. */
  readonly lostAt: number;
  readonly time: number;
  /** Lines still to pull. */
  readonly remaining: number;
  /** This step's events, oldest first. Cleared at the start of each step. */
  readonly events: readonly SimEvent[];
  tapCell(cx: number, cy: number): void;
  hint(): void;
  /** A watched ad's second chance: full hearts on the same board, same level and score. */
  revive(): void;
  step(dt: number): void;
}

const BEYOND = 4;

function buildLine(board: Board, i: number, appearAt: number): LineState {
  const l = board.lines[i];
  const { cols } = board;
  const xy = (c: number): [number, number] => [c % cols, Math.floor(c / cols)];
  const path: Array<[number, number]> = [];
  for (let k = l.cells.length - 1; k >= 0; k--) path.push(xy(l.cells[k]));
  const exit = rayOf(board.cols, board.rows, l.cells[0], l.dir);
  for (const c of exit) path.push(xy(c));
  const [hx, hy] = path[path.length - 1];
  for (let k = 1; k <= BEYOND + l.cells.length; k++) {
    path.push([hx + DX[l.dir] * k, hy + DY[l.dir] * k]);
  }
  return {
    path,
    len: l.cells.length,
    exitLen: exit.length,
    present: true,
    drawn: true,
    s: 0,
    v: 0,
    bumpT: -1,
    bumpTo: 0,
    flash: 0,
    exited: false,
    appearAt,
  };
}

export function createSim(runSeed: number, startLevel = 1): Sim {
  let board!: Board;
  let lines: LineState[] = [];
  let owner = new Int32Array(0);
  let level = startLevel;
  let hearts = T.HEARTS;
  let score = 0;
  let chain = 0;
  let lastPullAt = -Infinity;
  let phase: Phase = "intro";
  let phaseT = 0;
  let hintId = -1;
  let hintT = 0;
  let hintsLeft = 1;
  let mistakes = 0;
  let lostAt = -Infinity;
  let time = 0;
  let remaining = 0;
  const events: SimEvent[] = [];

  const deal = () => {
    board = levelBoard(level, runSeed);
    owner = new Int32Array(board.cols * board.rows).fill(-1);
    board.lines.forEach((l, i) => l.cells.forEach((c) => (owner[c] = i)));
    // Pop in from the middle of the board outwards, so a big board arrives
    // as a ripple rather than all at once.
    const cx = board.cols / 2;
    const cy = board.rows / 2;
    const far = Math.hypot(cx, cy) || 1;
    lines = board.lines.map((l, i) => {
      const h = l.cells[0];
      const d = Math.hypot((h % board.cols) - cx, Math.floor(h / board.cols) - cy) / far;
      return buildLine(board, i, d * T.INTRO * 0.8);
    });
    remaining = lines.length;
    phase = "intro";
    phaseT = 0;
    hintId = -1;
    hintsLeft = 1;
    mistakes = 0;
    chain = 0;
    events.push({ type: "deal" });
  };

  /** The first live cell on line i's way out, as an index along the exit. */
  const firstBlock = (i: number): { at: number; by: number } | null => {
    const l = board.lines[i];
    const exit = rayOf(board.cols, board.rows, l.cells[0], l.dir);
    for (let k = 0; k < exit.length; k++) {
      const o = owner[exit[k]];
      if (o >= 0 && o !== i) return { at: k, by: o };
    }
    return null;
  };

  const pull = (i: number) => {
    const ln = lines[i];
    ln.present = false;
    ln.bumpT = -1;
    ln.v = T.SLIDE_V0;
    for (const c of board.lines[i].cells) owner[c] = -1;
    remaining--;
    chain = time - lastPullAt <= T.CHAIN_WINDOW ? chain + 1 : 0;
    lastPullAt = time;
    score += T.PULL_POINTS + T.CHAIN_POINTS * Math.min(chain, T.CHAIN_CAP);
    if (hintId === i) hintId = -1;
    events.push({ type: "pull", id: i, chain });

    if (remaining === 0) {
      const bonus = T.CLEAR_POINTS + T.HEART_BONUS * hearts;
      score += bonus;
      // A clean board gives a heart back. Not a reward for playing longer
      // — for reading the board right — so it cannot be farmed.
      if (mistakes === 0 && hearts < T.HEARTS) {
        hearts++;
        events.push({ type: "heal" });
      }
      events.push({ type: "clear", bonus });
      phase = "clear";
      phaseT = 0;
    }
  };

  const bump = (i: number, at: number, by: number) => {
    const ln = lines[i];
    ln.bumpT = 0;
    ln.bumpTo = at + T.LUNGE_OVERSHOOT;
    ln.flash = T.FLASH;
    lines[by].flash = T.FLASH;
    hearts--;
    mistakes++;
    chain = 0;
    lastPullAt = -Infinity;
    lostAt = time;
    events.push({ type: "bump", id: i, blocker: by });
    events.push({ type: "heartLost", hearts });
    if (hearts <= 0) {
      phase = "lost";
      phaseT = 0;
      events.push({ type: "lost" });
    }
  };

  deal();

  return {
    get board() { return board; },
    get lines() { return lines; },
    get level() { return level; },
    get hearts() { return hearts; },
    get score() { return score; },
    get chain() { return chain; },
    get phase() { return phase; },
    get phaseT() { return phaseT; },
    get hintId() { return hintId; },
    get hintT() { return hintT; },
    get hintsLeft() { return hintsLeft; },
    get mistakes() { return mistakes; },
    get lostAt() { return lostAt; },
    get time() { return time; },
    get remaining() { return remaining; },
    get events() { return events; },

    tapCell(fx, fy) {
      if (phase !== "play") return;
      let id = -1;
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      if (x >= 0 && y >= 0 && x < board.cols && y < board.rows) id = owner[y * board.cols + x];
      if (id < 0) {
        // A near miss on an empty cell: the nearest line within half a cell.
        // Lines are thick but cells are not, and a thumb is wider than both.
        let best = 0.55;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= board.cols || ny >= board.rows) continue;
            const o = owner[ny * board.cols + nx];
            if (o < 0) continue;
            const d = Math.hypot(fx - (nx + 0.5), fy - (ny + 0.5)) - 0.5;
            if (d < best) {
              best = d;
              id = o;
            }
          }
        }
      }
      if (id < 0) return;
      const block = firstBlock(id);
      if (block) bump(id, block.at, block.by);
      else pull(id);
    },

    hint() {
      if (phase !== "play" || hintsLeft <= 0 || hintId >= 0) return;
      // The first line still present in the generator's order is always
      // free: everything that could block it comes earlier and is gone.
      for (const i of board.order) {
        if (lines[i].present) {
          hintId = i;
          hintT = 0;
          hintsLeft--;
          chain = 0;
          events.push({ type: "hint", id: i });
          return;
        }
      }
    },

    revive() {
      if (phase !== "lost" && phase !== "done") return;
      hearts = T.HEARTS;
      phase = "play";
      phaseT = 0;
      chain = 0;
      events.push({ type: "heal" });
    },

    step(dt) {
      events.length = 0;
      time += dt;
      phaseT += dt;

      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.flash > 0) ln.flash = Math.max(0, ln.flash - dt);
        if (!ln.present && ln.drawn) {
          ln.v = Math.min(T.SLIDE_VMAX, ln.v + T.SLIDE_ACCEL * dt);
          ln.s += ln.v * dt;
          if (!ln.exited && ln.s >= ln.exitLen + 0.5) {
            ln.exited = true;
            events.push({ type: "exit", id: i });
          }
          if (ln.s >= ln.exitLen + ln.len + BEYOND - 1) ln.drawn = false;
        } else if (ln.bumpT >= 0) {
          ln.bumpT += dt;
          const out = ln.bumpTo / T.LUNGE_SPEED;
          if (ln.bumpT < out) {
            const k = ln.bumpT / out;
            ln.s = ln.bumpTo * (1 - (1 - k) * (1 - k));
          } else {
            const k = Math.min(1, (ln.bumpT - out) / T.LUNGE_BACK);
            // Back with a small overshoot, so it settles rather than stops.
            const c = 1.70158;
            const e = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
            ln.s = ln.bumpTo * (1 - e);
            if (k >= 1) {
              ln.s = 0;
              ln.bumpT = -1;
            }
          }
        }
      }

      if (hintId >= 0) {
        hintT += dt;
        if (hintT > T.HINT_TIME) hintId = -1;
      }

      if (phase === "intro" && phaseT >= T.INTRO) {
        phase = "play";
        phaseT = 0;
      } else if (phase === "clear" && phaseT >= T.CLEAR_HOLD) {
        level++;
        deal();
      } else if (phase === "lost" && phaseT >= T.LOST_HOLD) {
        phase = "done";
        phaseT = 0;
      }
    },
  };
}
