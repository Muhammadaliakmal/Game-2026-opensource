import * as T from "./tuning";
import { DX, DY, type Board } from "./generate";
import type { LineState, Sim } from "./sim";
import { enterView, fitView } from "@/arcade/host/view";
import { gameFont, outlinedText } from "@/arcade/host/type";
import { icon } from "./art";

/**
 * Untwine's drawing.
 *
 * A line is a thick rounded stroke along its path with a triangle for a
 * head, over a darker stroke a little wider that stands it off the board —
 * the cheap version of a drop shadow, since `shadowBlur` is banned from
 * every cabinet's draw loop (CLAUDE.md, "Arcade surfaces").
 *
 * Feedback is layered so a fast player can read it at a glance:
 *  - a pull: the line runs off along its own path, a ring and a spray of
 *    its colour where it leaves, and the score it earned floats up;
 *  - a bump: the line runs into its blocker and springs back, both flash
 *    red, the screen shakes and a heart drops out of the HUD;
 *  - a chain: a flame and a multiplier that grow with every quick pull;
 *  - a clear: confetti and a banner, and a gold heart if the board was
 *    clean enough to earn one back.
 *
 * Nothing here allocates per frame: particles, rings and floating text are
 * fixed pools, recycled round-robin.
 */

const INK = "#0b1020";
const PANEL = "#141b33";
const DOT = "rgba(160,180,255,0.16)";
const RED = "#ff3b4f";
const TEXT = "#f3f5ff";
const DIM = "#8b96c9";

/** One colour per line, picked by the generator's cosmetic stream. */
export const PALETTE = [
  "#ff5d73",
  "#ffb02e",
  "#4be08a",
  "#3fc8ff",
  "#a98bff",
  "#ff7ad9",
  "#ffe14d",
  "#5cf2d6",
] as const;

/** The hint button, in view pixels. Input reads the same rectangle. */
export const HINT_BTN = { x: T.VIEW_W - 136, y: 10, w: 120, h: 40 } as const;

export interface Layout {
  cell: number;
  ox: number;
  oy: number;
}

/** Where a board sits in the view, and how big its cells are. */
export function boardLayout(board: Board): Layout {
  const aw = T.VIEW_W - T.BOARD_PAD * 2;
  const ah = T.VIEW_H - T.HUD_H - T.BOARD_PAD * 1.5;
  const cell = Math.min(T.MAX_CELL, Math.floor(Math.min(aw / board.cols, ah / board.rows)));
  return {
    cell,
    ox: Math.round((T.VIEW_W - cell * board.cols) / 2),
    oy: Math.round(T.HUD_H + (ah - cell * board.rows) / 2 + T.BOARD_PAD * 0.5),
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  color: string;
}

interface Floater {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

export interface Renderer {
  /** `best` is the best level reached on this device before this run. */
  draw(ctx: CanvasRenderingContext2D, sim: Sim, shake: { x: number; y: number }, w: number, h: number, best: number): void;
  step(dt: number): void;
  /** A line has left the board: spray and ring where it went. */
  exit(sim: Sim, id: number): void;
  /** Score floats up from a pulled line's head. */
  pulled(sim: Sim, id: number, points: number, chain: number): void;
  confetti(): void;
  /** The most recent heart change, for the HUD's pop. */
  heartChanged(): void;
}

export function createRenderer(rng: () => number, calm: boolean): Renderer {
  const particles: Particle[] = Array.from({ length: 220 }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: "#fff", gravity: 0,
  }));
  let pNext = 0;
  const rings: Ring[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0, t: 1, color: "#fff" }));
  let rNext = 0;
  const floaters: Floater[] = Array.from({ length: 14 }, () => ({ x: 0, y: 0, t: 1, text: "", color: "#fff" }));
  let fNext = 0;
  let heartPop = 1;

  const emit = (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, gravity: number) => {
    const p = particles[pNext];
    pNext = (pNext + 1) % particles.length;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color; p.gravity = gravity;
  };

  /** A point `t` cells along a line's path, in view pixels. */
  const at = (ln: LineState, t: number, L: Layout): [number, number] => {
    const last = ln.path.length - 1;
    const tt = Math.max(0, Math.min(last, t));
    const i = Math.min(last - 1, Math.floor(tt));
    const f = tt - i;
    const [ax, ay] = ln.path[i];
    const [bx, by] = ln.path[i + 1];
    return [L.ox + (ax + (bx - ax) * f + 0.5) * L.cell, L.oy + (ay + (by - ay) * f + 0.5) * L.cell];
  };

  const tracePath = (ctx: CanvasRenderingContext2D, ln: LineState, L: Layout) => {
    const t0 = ln.s;
    const t1 = ln.s + ln.len - 1;
    const [sx, sy] = at(ln, t0, L);
    ctx.moveTo(sx, sy);
    for (let k = Math.floor(t0) + 1; k < t1; k++) {
      const [x, y] = at(ln, k, L);
      ctx.lineTo(x, y);
    }
    const [ex, ey] = at(ln, t1, L);
    ctx.lineTo(ex, ey);
  };

  /** The direction the head is travelling at path position t. */
  const headDir = (ln: LineState, t: number): [number, number] => {
    const i = Math.min(ln.path.length - 2, Math.floor(t + 1e-6));
    const [ax, ay] = ln.path[i];
    const [bx, by] = ln.path[i + 1];
    return [bx - ax, by - ay];
  };

  function drawLine(ctx: CanvasRenderingContext2D, sim: Sim, i: number, L: Layout) {
    const ln = sim.lines[i];
    if (!ln.drawn) return;
    let scale = 1;
    let alpha = 1;
    if (sim.phase === "intro") {
      const k = Math.max(0, Math.min(1, (sim.phaseT - ln.appearAt) / 0.2));
      if (k <= 0) return;
      // Back-out: overshoot a touch and settle, so the board lands.
      const c = 1.9;
      scale = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
      alpha = k;
    }
    if (!ln.present) {
      // Fade as the head clears the board edge.
      const past = ln.s - ln.exitLen;
      alpha = Math.max(0, Math.min(1, 1 - (past - 0.5) / (ln.len + 1.5)));
      if (alpha <= 0) return;
    }

    const base = PALETTE[sim.board.lines[i].hue % PALETTE.length];
    const flashing = ln.flash > 0 && Math.floor(ln.flash * 18) % 2 === 0;
    const color = flashing ? RED : base;
    const w = L.cell * 0.27 * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Hinted: a soft pulsing halo and a dotted guide out to the edge.
    if (sim.hintId === i) {
      const pulse = 0.35 + 0.3 * Math.sin(sim.hintT * Math.PI * 4);
      ctx.strokeStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
      ctx.lineWidth = w * 2.4;
      ctx.beginPath();
      tracePath(ctx, ln, L);
      ctx.stroke();
      const [hx, hy] = at(ln, ln.len - 1, L);
      const d = sim.board.lines[i].dir;
      ctx.setLineDash([L.cell * 0.12, L.cell * 0.22]);
      ctx.lineDashOffset = -sim.hintT * L.cell;
      ctx.lineWidth = Math.max(2, L.cell * 0.07);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + DX[d] * (ln.exitLen + 0.5) * L.cell, hy + DY[d] * (ln.exitLen + 0.5) * L.cell);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Shadow, body, gloss.
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = w + Math.max(3, L.cell * 0.1);
    ctx.beginPath();
    tracePath(ctx, ln, L);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = w * 0.3;
    ctx.stroke();

    // The head: a triangle pointing the way the line will leave.
    const t1 = ln.s + ln.len - 1;
    const [hx, hy] = at(ln, t1, L);
    const [dx, dy] = headDir(ln, t1);
    const tip = L.cell * 0.44 * scale;
    const back = L.cell * 0.04 * scale;
    const half = L.cell * 0.3 * scale;
    ctx.beginPath();
    ctx.moveTo(hx + dx * tip, hy + dy * tip);
    ctx.lineTo(hx - dx * back - dy * half, hy - dy * back + dx * half);
    ctx.lineTo(hx - dx * back + dy * half, hy - dy * back - dx * half);
    ctx.closePath();
    ctx.lineWidth = Math.max(3, L.cell * 0.1);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawHud(ctx: CanvasRenderingContext2D, sim: Sim) {
    // Level, with the flag.
    icon(ctx, "flag", 34, 30, 34);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = gameFont(26);
    outlinedText(ctx, `LEVEL ${sim.level}`, 58, 29, TEXT, 26);

    // Hearts, centred. A lost heart stays as a ghost so the count reads.
    const n = T.HEARTS;
    const size = 38;
    const gap = 6;
    const x0 = T.VIEW_W / 2 - ((n - 1) * (size + gap)) / 2;
    for (let k = 0; k < n; k++) {
      const alive = k < sim.hearts;
      const justLost = k === sim.hearts && sim.time - sim.lostAt < 0.5;
      let s = size;
      let dx = 0;
      if (alive && k === sim.hearts - 1) s *= heartPop;
      if (justLost) {
        const e = (sim.time - sim.lostAt) / 0.5;
        dx = Math.sin(e * 40) * 6 * (1 - e);
        s *= 1 + 0.3 * (1 - e);
      }
      icon(ctx, "heart-green", x0 + k * (size + gap) + dx, 30, s, alive ? 1 : justLost ? 0.6 : 0.18);
    }

    // Chain: a flame and a multiplier, once it is worth showing.
    if (sim.chain >= 2) {
      const grow = Math.min(1.25, 1 + sim.chain * 0.025);
      const cx = HINT_BTN.x - 74;
      icon(ctx, "fire", cx, 30, 34 * grow);
      ctx.font = gameFont(22);
      ctx.textAlign = "left";
      outlinedText(ctx, `×${Math.min(sim.chain, T.CHAIN_CAP) + 1}`, cx + 20, 30, "#ffb02e", 22);
    }

    // Hint button.
    const b = HINT_BTN;
    const live = sim.hintsLeft > 0 && sim.phase === "play" && sim.hintId < 0;
    ctx.save();
    ctx.globalAlpha = live ? 1 : 0.4;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, b.x, b.y + 3, b.w, b.h, 12);
    ctx.fill();
    ctx.fillStyle = live ? "#ffd166" : "#3a4266";
    roundRect(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.font = gameFont(20);
    ctx.textAlign = "center";
    ctx.fillStyle = live ? "#3a2400" : DIM;
    ctx.fillText(sim.hintsLeft > 0 ? "HINT" : "NO HINT", b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.restore();
  }

  function drawBanner(ctx: CanvasRenderingContext2D, sim: Sim, best: number) {
    const W = T.VIEW_W;
    const H = T.VIEW_H;
    if (sim.phase === "intro" && sim.phaseT < T.INTRO) {
      const k = sim.phaseT / T.INTRO;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
      ctx.font = gameFont(54);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      outlinedText(ctx, `LEVEL ${sim.level}`, W / 2, H / 2 + 10 - k * 12, TEXT, 54);
      ctx.restore();
    }
    if (sim.phase === "clear") {
      const k = Math.min(1, sim.phaseT / 0.25);
      ctx.save();
      ctx.fillStyle = `rgba(5,8,20,${(0.45 * k).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      const s = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3));
      ctx.scale(s, s);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = gameFont(58);
      outlinedText(ctx, sim.mistakes === 0 ? "FLAWLESS!" : "CLEAR!", 0, -30, sim.mistakes === 0 ? "#ffd166" : "#7dffb0", 58);
      ctx.font = gameFont(24);
      outlinedText(ctx, `+${T.CLEAR_POINTS + T.HEART_BONUS * sim.hearts}`, 0, 22, TEXT, 24);
      if (sim.mistakes === 0 && sim.hearts <= T.HEARTS) {
        const bob = Math.sin(sim.phaseT * 6) * 4;
        icon(ctx, "heart-gold", 0, 72 + bob, 56 * Math.min(1, sim.phaseT * 3));
      }
      ctx.restore();
    }
    if (sim.phase === "lost" || sim.phase === "done") {
      const k = Math.min(1, sim.phaseT / 0.3);
      ctx.save();
      ctx.fillStyle = `rgba(20,4,10,${(0.6 * k).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = k;
      ctx.font = gameFont(54);
      outlinedText(ctx, "OUT OF HEARTS", W / 2, H / 2 - 30, RED, 54);
      ctx.font = gameFont(24);
      const record = sim.level > best;
      outlinedText(ctx, `You reached level ${sim.level}`, W / 2, H / 2 + 22, TEXT, 24);
      if (record) {
        icon(ctx, "crown", W / 2, H / 2 + 76, 64);
        ctx.font = gameFont(18);
        outlinedText(ctx, "NEW BEST", W / 2, H / 2 + 118, "#ffd166", 18);
      } else {
        ctx.font = gameFont(18);
        outlinedText(ctx, `Best: level ${best}`, W / 2, H / 2 + 62, DIM, 18);
      }
      ctx.restore();
    }
  }

  return {
    draw(ctx, sim, shake, w, h, best) {
      const view = fitView(w, h, T.VIEW_W, T.VIEW_H);
      enterView(ctx, view, w, h, INK);
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, T.VIEW_W, T.VIEW_H);
      ctx.save();
      ctx.translate(shake.x, shake.y);

      const { board } = sim;
      const L = boardLayout(board);

      // The board: a panel, and a dot on every cell that exists.
      ctx.fillStyle = PANEL;
      roundRect(ctx, L.ox - 10, L.oy - 10, board.cols * L.cell + 20, board.rows * L.cell + 20, 16);
      ctx.fill();
      ctx.fillStyle = DOT;
      ctx.beginPath();
      const r = Math.max(1.5, L.cell * 0.07);
      for (let c = 0; c < board.mask.length; c++) {
        if (!board.mask[c]) continue;
        const x = L.ox + ((c % board.cols) + 0.5) * L.cell;
        const y = L.oy + (Math.floor(c / board.cols) + 0.5) * L.cell;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Pulled lines under present ones, so a line leaving slides beneath.
      for (let i = 0; i < sim.lines.length; i++) if (!sim.lines[i].present) drawLine(ctx, sim, i, L);
      for (let i = 0; i < sim.lines.length; i++) if (sim.lines[i].present) drawLine(ctx, sim, i, L);

      // Rings, particles, floating score.
      ctx.lineWidth = 3;
      for (const g of rings) {
        if (g.t >= 1) continue;
        ctx.strokeStyle = g.color;
        ctx.globalAlpha = 1 - g.t;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 6 + g.t * L.cell * 1.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of particles) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + 0.6 * (p.life / p.max));
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of floaters) {
        if (f.t >= 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - f.t * f.t;
        ctx.font = gameFont(20);
        outlinedText(ctx, f.text, f.x, f.y - f.t * 36, f.color, 20);
        ctx.restore();
      }
      ctx.restore();

      drawHud(ctx, sim);
      drawBanner(ctx, sim, best);
      ctx.restore();
    },

    step(dt) {
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy += p.gravity * dt;
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const g of rings) if (g.t < 1) g.t = Math.min(1, g.t + dt / 0.45);
      for (const f of floaters) if (f.t < 1) f.t = Math.min(1, f.t + dt / 0.8);
      if (heartPop > 1) heartPop = Math.max(1, heartPop - dt * 2);
    },

    exit(sim, id) {
      const ln = sim.lines[id];
      const L = boardLayout(sim.board);
      const [x, y] = at(ln, ln.exitLen + ln.len - 0.5, L);
      const color = PALETTE[sim.board.lines[id].hue % PALETTE.length];
      const d = sim.board.lines[id].dir;
      const g = rings[rNext];
      rNext = (rNext + 1) % rings.length;
      g.x = x; g.y = y; g.t = 0; g.color = color;
      if (calm) return;
      const n = 10 + Math.min(14, sim.chain * 2);
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(DY[d], DX[d]) + (rng() - 0.5) * 1.5;
        const v = 120 + rng() * 260;
        emit(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + rng() * 0.35, 3 + rng() * 4, color, 0);
      }
    },

    pulled(sim, id, points, chain) {
      const ln = sim.lines[id];
      const L = boardLayout(sim.board);
      const [x, y] = at(ln, ln.len - 1, L);
      const f = floaters[fNext];
      fNext = (fNext + 1) % floaters.length;
      f.x = x; f.y = y - L.cell * 0.4; f.t = 0;
      f.text = `+${points}`;
      f.color = chain >= 2 ? "#ffb02e" : TEXT;
    },

    confetti() {
      if (calm) return;
      for (let k = 0; k < 70; k++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 2.2;
        const v = 260 + rng() * 420;
        emit(T.VIEW_W / 2, T.VIEW_H * 0.62, Math.cos(a) * v, Math.sin(a) * v, 0.9 + rng() * 0.7, 5 + rng() * 5, PALETTE[k % PALETTE.length], 900);
      }
    },

    heartChanged() {
      heartPop = 1.45;
    },
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
