import { createSim, DIRS, type Dir, type GravitySim, type Saved } from "./sim";
import { LEVELS } from "./levels";

/**
 * Plays a room by brute force, so the tests can say "this can be done".
 *
 * A breadth-first search over rest states. From each, every direction is
 * tried both immediately and again after a handful of delays — the delayed
 * flips are what find the mid-fall solutions — and the ball is run until
 * it comes to rest, dies, or finishes. States are keyed on the ball's tile,
 * the direction of gravity and the glass that is left, so a room of a few
 * hundred cells is a few thousand nodes at most.
 *
 * Not used by the game. A level's `par` is what this finds, written down by
 * hand so the HUD can show it without a search on a phone.
 */

export interface Move {
  dir: Dir;
  /** Steps waited after the previous move before this one; 0 is "at rest". */
  after: number;
}

const DT = 1 / 60;
/** Delays tried after a flip, in steps, for the mid-fall moves. */
const DELAYS = [0, 6, 10, 14, 18, 22, 26, 30, 36, 42, 48, 56];
/** At rest only: the flips a player makes by looking, not by timing. */
const AT_REST = [0];
const SETTLE_MAX = 600;

/** Run until the ball rests, dies or clears. Returns what happened. */
export function settle(sim: GravitySim, max = SETTLE_MAX): "rest" | "dead" | "clear" | "stuck" {
  let stillFor = 0;
  for (let i = 0; i < max; i++) {
    sim.step(DT);
    if (sim.phase === "dead" || sim.phase === "done") return "dead";
    if (sim.phase === "clear") return "clear";
    if (sim.resting) {
      if (++stillFor >= 3) return "rest";
    } else stillFor = 0;
  }
  return "stuck";
}

function keyOf(s: Saved): string {
  const c = Math.round(s.px / 40);
  const r = Math.round(s.py / 40);
  let glass = "";
  for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 5) glass += i + ",";
  return `${c}:${r}:${s.gravity}:${glass}`;
}

/**
 * The fewest flips that clear `level`, or null.
 *
 * With `midAir` false only flips from rest are tried, which is the par a
 * player can find by looking at the room. With it true the delayed flips are
 * in, which is what the last rooms need and what beating par means on the
 * others.
 */
export function solve(level: number, midAir = false, maxMoves = 12): Move[] | null {
  const sim = createSim();
  sim.jumpTo(level);
  // A room must start at rest: a ball that falls before the first choice is
  // a room that plays itself, and the solver refuses it so the suite does.
  const start = settle(sim);
  if (start === "clear") return [];
  if (start !== "rest") return null;

  const seen = new Set<string>([keyOf(sim.save())]);
  // `waited` is how long the node's last flip has been running: 0 means the
  // ball came to rest, otherwise the steps taken so far mid-fall. It becomes
  // the `after` of whatever move is made from the node.
  let frontier: Array<{ state: Saved; moves: Move[]; waited: number }> = [
    { state: sim.save(), moves: [], waited: 0 },
  ];

  // Breadth-first over flips: every node at depth d is d flips in, whether
  // the ball is at rest there or mid-fall. That is what makes the answer
  // the fewest flips rather than the fewest rests.
  for (let depth = 0; depth < maxMoves && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const dir of Object.keys(DIRS) as Dir[]) {
        if (dir === node.state.gravity) continue;
        const moves = [...node.moves, { dir, after: node.waited }];
        for (const delay of midAir ? DELAYS : AT_REST) {
          sim.load(node.state);
          sim.flip(dir);
          if (delay === 0) {
            const r = settle(sim);
            if (r === "clear") return moves;
            if (r !== "rest") continue;
          } else {
            for (let i = 0; i < delay && sim.phase === "play"; i++) sim.step(DT);
            if (sim.phase === "clear") return moves;
            if (sim.phase !== "play" || sim.resting) continue;
          }
          const saved = sim.save();
          // Only rest states are deduplicated. Two mid-fall states a few
          // steps apart share a tile and a speed bucket and are not the same
          // state at all — the one that enters a pocket and the one that
          // hits the wall above it.
          if (delay === 0) {
            const k = keyOf(saved);
            if (seen.has(k)) continue;
            seen.add(k);
          }
          next.push({ state: saved, moves, waited: delay });
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** Play a written solution and report whether it clears the room. */
export function play(level: number, moves: Move[]): boolean {
  const sim = createSim();
  sim.jumpTo(level);
  if (settle(sim) === "clear") return true;
  for (const m of moves) {
    if (m.after === 0) {
      const r = settle(sim);
      if (r === "clear") return true;
      if (r !== "rest") return false;
    } else {
      for (let i = 0; i < m.after && sim.phase === "play"; i++) sim.step(DT);
    }
    if (sim.phase !== "play") return sim.phase === "clear";
    sim.flip(m.dir);
  }
  return settle(sim) === "clear";
}

export const levelCount = () => LEVELS.length;
