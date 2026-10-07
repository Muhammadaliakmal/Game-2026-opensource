import { mulberry32 } from "@/arcade/host/rng";

/**
 * Untwine's level generator and solver. Pure: no canvas, no DOM, no clock.
 *
 * ── The board ────────────────────────────────────────────────────────────
 *
 * A `cols × rows` grid and a mask of which cells exist. Shaped boards (a
 * heart, a diamond) are the same grid with cells switched off; a line's
 * exit runs to the edge of the GRID, straight through switched-off cells,
 * which keeps "where does it go" a question about straight lines only.
 *
 * A line is a list of cells, head first, and the direction its head points.
 * It may leave when every cell from the head to the grid edge is empty.
 *
 * ── Order insertion ─────────────────────────────────────────────────────
 *
 * The generator keeps an explicit removal order and only ever places a line
 * where it can be slotted into that order without breaking it:
 *
 *  - every line sitting on the new line's exit must leave BEFORE it
 *    (`lo` = the latest of them), and
 *  - every line whose exit crosses the new line's cells must leave AFTER it
 *    (`hi` = the earliest of them).
 *
 * `lo < hi` means there is a gap, and the line goes in right after `lo`.
 * Every edge of the "blocked by" graph then points forward in the order, so
 * the order is a topological sort and the board is solvable by construction.
 * That is a generalisation of both textbook approaches — place in solve order
 * (holes) or in reverse removal order (crowded interiors) — and it fills
 * 95%+ of the board. `solve` checks it independently anyway.
 *
 * Each step takes the most interesting of `k` valid candidates; more
 * candidates means more selection pressure, which means deeper chains and
 * fewer lines free at the start — `k` is the difficulty dial that matters.
 */

export type Dir = 0 | 1 | 2 | 3;
/** Right, down, left, up — screen axes, y down. */
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export interface Line {
  /** Cell indices (`y * cols + x`), head first. */
  cells: number[];
  dir: Dir;
  /** Index into the renderer's palette. Cosmetic, from its own stream. */
  hue: number;
}

export type Shape = "rect" | "heart" | "diamond" | "round";

export interface Board {
  cols: number;
  rows: number;
  /** 1 where a cell exists. */
  mask: Uint8Array;
  lines: Line[];
  /** A removal order that clears the board — the hint's source. */
  order: number[];
}

export interface GenParams {
  cols: number;
  rows: number;
  shape: Shape;
  minLen: number;
  maxLen: number;
  /** 0..1 — how often the walk turns when it could go straight. */
  bend: number;
  /** Candidates weighed per placement. */
  k: number;
}

export interface Stats {
  solvable: boolean;
  /** Layers of the blocked-by graph: the longest chain of "first that one". */
  depth: number;
  /** Lines that can leave before anything else has. */
  initialFree: number;
  /** Fraction of existing cells a line covers. */
  coverage: number;
}

export const PALETTE_SIZE = 8;

/** The cells from just past `head` to the grid edge, along `dir`. */
export function rayOf(cols: number, rows: number, head: number, dir: Dir): number[] {
  const out: number[] = [];
  let x = (head % cols) + DX[dir];
  let y = Math.floor(head / cols) + DY[dir];
  while (x >= 0 && y >= 0 && x < cols && y < rows) {
    out.push(y * cols + x);
    x += DX[dir];
    y += DY[dir];
  }
  return out;
}

export function maskFor(cols: number, rows: number, shape: Shape): Uint8Array {
  const m = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Centre of the cell in -1..1 on each axis, y up.
      const u = ((x + 0.5) / cols) * 2 - 1;
      const v = 1 - ((y + 0.5) / rows) * 2;
      let inside = true;
      if (shape === "diamond") inside = Math.abs(u) + Math.abs(v) <= 1.05;
      else if (shape === "round") inside = u * u + v * v <= 1.02;
      else if (shape === "heart") {
        // The classic implicit heart, scaled to sit inside the box.
        const hu = u * 1.25;
        const hv = v * 1.3 + 0.2;
        const a = hu * hu + hv * hv - 1;
        inside = a * a * a - hu * hu * hv * hv * hv <= 0;
      }
      m[y * cols + x] = inside ? 1 : 0;
    }
  }
  return m;
}

/** Kahn over the blocked-by graph. Independent of how the board was made. */
export function solve(board: Board): Stats & { removal: number[] } {
  const { cols, rows, lines, mask } = board;
  const owner = new Int32Array(cols * rows).fill(-1);
  lines.forEach((l, i) => l.cells.forEach((c) => (owner[c] = i)));

  const indeg = new Int32Array(lines.length);
  const dependents: number[][] = lines.map(() => []);
  let selfBlocked = false;
  lines.forEach((l, i) => {
    const blockers = new Set<number>();
    for (const c of rayOf(cols, rows, l.cells[0], l.dir)) {
      if (owner[c] >= 0) blockers.add(owner[c]);
    }
    if (blockers.has(i)) selfBlocked = true;
    blockers.delete(i);
    indeg[i] = blockers.size;
    for (const b of blockers) dependents[b].push(i);
  });

  let queue: number[] = [];
  for (let i = 0; i < lines.length; i++) if (indeg[i] === 0) queue.push(i);
  const initialFree = queue.length;
  const removal: number[] = [];
  let depth = 0;
  while (queue.length) {
    depth++;
    const next: number[] = [];
    for (const i of queue) {
      removal.push(i);
      for (const j of dependents[i]) if (--indeg[j] === 0) next.push(j);
    }
    queue = next;
  }

  let cells = 0;
  let covered = 0;
  for (let c = 0; c < mask.length; c++) {
    if (!mask[c]) continue;
    cells++;
    if (owner[c] >= 0) covered++;
  }
  return {
    solvable: !selfBlocked && removal.length === lines.length,
    depth,
    initialFree,
    coverage: cells ? covered / cells : 0,
    removal,
  };
}

interface Candidate {
  cells: number[];
  dir: Dir;
  ray: number[];
  lo: number;
  score: number;
}

export function generate(p: GenParams, seed: number): Board {
  const { cols, rows } = p;
  const n = cols * rows;
  const rnd = mulberry32(seed);
  const look = mulberry32(seed ^ 0x5bd1e995);
  const mask = maskFor(cols, rows, p.shape);

  const owner = new Int32Array(n).fill(-1);
  /** Lines whose exit crosses each cell. */
  const rayHits: number[][] = Array.from({ length: n }, () => []);
  const lines: Line[] = [];
  const order: number[] = [];
  const pos: number[] = [];

  const minHit = (c: number) => {
    let m = Infinity;
    for (const a of rayHits[c]) if (pos[a] < m) m = pos[a];
    return m;
  };
  const free = (c: number) => mask[c] === 1 && owner[c] < 0;
  const step = (c: number, d: Dir) => {
    const x = (c % cols) + DX[d];
    const y = Math.floor(c / cols) + DY[d];
    return x >= 0 && y >= 0 && x < cols && y < rows ? y * cols + x : -1;
  };

  /** Snek's length curve: biased long, so boards are tangles, not confetti. */
  const length = () => {
    const t = Math.pow(rnd(), 0.62);
    return p.minLen + Math.floor(t * (p.maxLen - p.minLen + 1));
  };

  const tryAt = (head: number, dir: Dir): Candidate | null => {
    if (!free(head)) return null;
    const back = ((dir + 2) % 4) as Dir;
    const tail = step(head, back);
    if (tail < 0 || !free(tail)) return null;
    const ray = rayOf(cols, rows, head, dir);
    const inRay = new Set(ray);
    let lo = -1;
    let direct = 0;
    const seen = new Set<number>();
    for (const c of ray) {
      const o = owner[c];
      if (o >= 0 && !seen.has(o)) {
        seen.add(o);
        direct++;
        if (pos[o] > lo) lo = pos[o];
      }
    }
    let hi = Math.min(minHit(head), minHit(tail));
    if (!(lo < hi)) return null;

    const cells = [head, tail];
    const taken = new Set(cells);
    let walk: Dir = back;
    let bends = 0;
    const target = length();
    while (cells.length < target) {
      const at = cells[cells.length - 1];
      const opts: Dir[] = [];
      let straight = false;
      for (const d of [walk, ((walk + 1) % 4) as Dir, ((walk + 3) % 4) as Dir]) {
        const c = step(at, d);
        if (c < 0 || !free(c) || taken.has(c) || inRay.has(c)) continue;
        if (!(lo < Math.min(hi, minHit(c)))) continue;
        if (d === walk) straight = true;
        opts.push(d);
      }
      if (!opts.length) break;
      const turns = opts.filter((d) => d !== walk);
      const turn = turns.length > 0 && (!straight || rnd() < p.bend);
      const d = turn ? turns[Math.floor(rnd() * turns.length)] : walk;
      if (d !== walk) bends++;
      walk = d;
      const c = step(at, d);
      hi = Math.min(hi, minHit(c));
      cells.push(c);
      taken.add(c);
    }
    if (cells.length < p.minLen) return null;

    // Interesting = long, bent, and waiting on others. Immediately free is
    // the least interesting thing a line can be.
    const score =
      2 * cells.length + 3 * bends + 4 * direct + (direct === 0 ? -6 : 0) + rnd() * 3;
    return { cells, dir, ray, lo, score };
  };

  const commit = (c: Candidate) => {
    const id = lines.length;
    lines.push({ cells: c.cells, dir: c.dir, hue: Math.floor(look() * PALETTE_SIZE) });
    for (const cell of c.cells) owner[cell] = id;
    for (const cell of c.ray) rayHits[cell].push(id);
    order.splice(c.lo + 1, 0, id);
    pos.length = lines.length;
    order.forEach((a, i) => (pos[a] = i));
  };

  const shuffled = <T,>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  };

  // Best of k, scanning every free cell × direction before giving up — so
  // the last pass is exhaustive and picks up the small pockets too.
  for (;;) {
    const cells: number[] = [];
    for (let c = 0; c < n; c++) if (free(c)) cells.push(c);
    if (!cells.length) break;
    shuffled(cells);
    let best: Candidate | null = null;
    let found = 0;
    outer: for (const c of cells) {
      for (const d of shuffled([0, 1, 2, 3] as Dir[])) {
        const cand = tryAt(c, d);
        if (!cand) continue;
        if (!best || cand.score > best.score) best = cand;
        if (++found >= p.k) break outer;
      }
    }
    if (!best) break;
    commit(best);
  }

  // Hole repair: grow a tail into a free neighbour, where the order allows.
  // The cell joins line i, so every line whose exit crosses it is now waiting
  // on i, and i must already leave before all of them.
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < n; c++) {
      if (!free(c)) continue;
      for (const d of [0, 1, 2, 3] as Dir[]) {
        const nb = step(c, d);
        if (nb < 0 || owner[nb] < 0) continue;
        const i = owner[nb];
        const line = lines[i];
        if (line.cells[line.cells.length - 1] !== nb) continue;
        if (line.cells.length >= p.maxLen + 2) continue;
        if (rayHits[c].includes(i)) continue;
        if (!(pos[i] < minHit(c))) continue;
        line.cells.push(c);
        owner[c] = i;
        break;
      }
    }
  }

  return { cols, rows, mask, lines, order };
}

/** ── The ladder ──────────────────────────────────────────────────────── */

/**
 * What board number `level` (1-based) is made of.
 *
 * The first boards teach: straight lines only, then a bend or two. After
 * that every dial climbs together, with every fifth board a breather — a
 * smaller board in a shape — because a curve that only rises is a curve
 * people quit on rather than finish.
 */
export function paramsFor(level: number): GenParams {
  const L = Math.max(1, level);
  const breather = L % 5 === 0;
  const rows = Math.min(13, 3 + Math.floor(L * 0.55)) - (breather ? 1 : 0);
  // The view is wider than tall; boards are too, up to the cell-size floor.
  const cols = Math.min(22, Math.round(rows * (L < 4 ? 1.25 : 1.7)));
  const shapes: Shape[] = ["heart", "diamond", "round"];
  return {
    cols: Math.max(4, cols),
    rows: Math.max(3, rows),
    // A heart four cells tall is a blob, so shapes wait for a board with
    // the rows to draw one.
    shape: breather && rows >= 7 ? shapes[(L / 5) % shapes.length] : "rect",
    minLen: 2,
    maxLen: Math.min(14, 3 + Math.floor(L / 2)),
    bend: L <= 2 ? 0 : Math.min(0.55, 0.12 + L * 0.03),
    k: breather ? 2 : Math.min(18, 1 + L),
  };
}

/**
 * A run's board `level`: generated, measured, and re-rolled if it came out
 * thin. Each attempt is a fresh seed derived from the run, the level and the
 * attempt, so a run is reproducible from its seed and two runs differ.
 */
export function levelBoard(level: number, runSeed: number): Board {
  const p = paramsFor(level);
  let best: Board | null = null;
  let bestCover = -1;
  for (let attempt = 0; attempt < 6; attempt++) {
    const seed = (Math.imul(runSeed ^ (level * 0x9e3779b1), 0x85ebca6b) + attempt * 0xc2b2ae35) >>> 0;
    const b = generate(p, seed);
    const s = solve(b);
    if (!s.solvable) continue;
    if (s.coverage >= 0.9 && b.lines.length >= 2) return b;
    if (s.coverage > bestCover) {
      best = b;
      bestCover = s.coverage;
    }
  }
  // Six thin boards in a row has not happened in testing; if it does, the
  // thinnest-but-solvable one is still a fine board to play.
  return best ?? generate(p, runSeed);
}
