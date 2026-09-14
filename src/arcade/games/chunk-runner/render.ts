import * as T from "./tuning";
import { surfaceY, type Sim } from "./sim";
import { bevelRect, grainOverlay, plateOverlay } from "@/arcade/host/texture";

/** Platform plating and grain: module tiles, painted once, shared by runs. */
const PLATE = plateOverlay(21);
const GRAIN = grainOverlay(22, 0.12);

/**
 * Chunk Runner's drawing, and nothing else.
 *
 * ── Parallax is three pre-rendered strips, not three loops ───────────────
 *
 * The background is drawn once into offscreen canvases at construction and
 * blitted with an x-offset every frame. Redrawing a skyline of forty
 * rectangles three times a frame would cost more than the game does, for a
 * picture that never changes — and each strip is one `drawImage` per screen
 * width, so the whole background is at most six draws.
 *
 * ── Integer-rounded positions ────────────────────────────────────────────
 *
 * Every blit lands on a whole pixel. A strip drawn at a fractional offset is
 * resampled by the browser, which turns crisp blocks into a shimmer that is
 * worst on exactly the slow scrolling layers parallax is made of.
 *
 * ── No allocation in `draw` ──────────────────────────────────────────────
 *
 * The particle pool, the gradients and the strips are all made in
 * `createRenderer`. `draw` assigns numbers and calls canvas methods.
 *
 * ── Surfaces ─────────────────────────────────────────────────────────────
 *
 * The sky is a gradient with a field of stars, pre-rendered into the slowest
 * strip so it parallaxes with the skyline. Platforms are their colour, a
 * riveted-plate tile and a grain tile over it — three `fillRect`s where
 * there was one — and the lit lip stays exactly as bright as it was, because
 * it is the one edge the game is about. See host/texture.ts.
 */

/** Width of one repeating background strip, in pixels. */
const STRIP_W = 512;

interface Layer {
  canvas: HTMLCanvasElement;
  /** How fast this layer scrolls, relative to the world. */
  factor: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const DUST = 24;

export interface Renderer {
  /**
   * `canvasW`/`canvasH` are the real canvas in CSS pixels; everything inside
   * is drawn at the fixed view size and scaled to fit them.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    alpha: number,
    shake: number,
    canvasW: number,
    canvasH: number
  ): void;
  /** Kick a puff of dust at a world position. Called from the game, not here. */
  puff(x: number, y: number, rng: () => number): void;
  step(dt: number): void;
  destroy(): void;
}

export function createRenderer(rng: () => number): Renderer {
  // The view, not the canvas. See VIEW_W in tuning.ts for why the difference
  // matters more than it looks.
  const w = T.VIEW_W;
  const h = T.VIEW_H;

  const dust: Dust[] = [];
  for (let i = 0; i < DUST; i++) dust.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  let dustNext = 0;

  /**
   * One repeating strip of skyline.
   *
   * Seeded from the same rng as the run, so the background of a given seed is
   * the background of that seed — which matters the one time somebody compares
   * two recordings of the same run.
   */
  function strip(bandTop: number, colour: string, minH: number, maxH: number) {
    const c = document.createElement("canvas");
    c.width = STRIP_W;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) return c;
    g.fillStyle = colour;
    let x = 0;
    while (x < STRIP_W) {
      const bw = 24 + rng() * 46;
      const bh = minH + rng() * (maxH - minH);
      g.fillRect(Math.round(x), Math.round(bandTop - bh), Math.round(bw), Math.round(bh));
      x += bw + 8 + rng() * 20;
    }
    return c;
  }

  /**
   * The sky: a gradient from near-black at the top to the skyline's own blue
   * at the horizon, with stars that thin out toward it — the same fade the
   * world's night sky applies, for the same reason. Opaque, so it is the
   * first strip and the flat backdrop under it is only ever seen for the
   * frame a shake exposes an edge.
   */
  function sky() {
    const c = document.createElement("canvas");
    c.width = STRIP_W;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) return c;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#04061a");
    grad.addColorStop(0.6, "#0a0f2e");
    grad.addColorStop(1, "#141b4a");
    g.fillStyle = grad;
    g.fillRect(0, 0, STRIP_W, h);
    for (let i = 0; i < 90; i++) {
      const t = rng();
      const y = rng() * rng() * h * 0.7;
      const r = t > 0.92 ? 2 : 1;
      g.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.6})`;
      g.fillRect(Math.floor(rng() * STRIP_W), Math.floor(y), r, r);
    }
    return c;
  }

  const base = h - T.GROUND_Y;
  let layers: Layer[] = [
    { canvas: sky(), factor: 0.04 },
    { canvas: strip(base - 40, "#131a3c", 60, 190), factor: 0.15 },
    { canvas: strip(base - 12, "#1b2452", 40, 130), factor: 0.35 },
    { canvas: strip(base + 4, "#232e63", 20, 70), factor: 0.6 },
  ];

  function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, camX: number) {
    // Modulo keeps the offset small whatever the run's distance: at 780 px/s
    // for ten minutes, camX is past 400,000, and a float that large loses the
    // precision a smooth scroll needs.
    const off = Math.round(camX * layer.factor) % STRIP_W;
    for (let x = -off; x < w; x += STRIP_W) {
      ctx.drawImage(layer.canvas, x, 0);
    }
  }

  return {
    step(dt) {
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        if (d.life <= 0) continue;
        d.life -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 900 * dt;
      }
    },

    puff(x, y, r) {
      for (let i = 0; i < 6; i++) {
        const d = dust[dustNext];
        dustNext = (dustNext + 1) % dust.length;
        d.x = x;
        d.y = y;
        d.vx = -60 - r() * 140;
        d.vy = -40 - r() * 90;
        d.life = 0.25 + r() * 0.2;
      }
    },

    draw(ctx, sim, alpha, shake, canvasW, canvasH) {
      // Interpolated, which is the whole reason `render` takes an alpha: at
      // 144Hz most frames fall between two sim steps.
      const px = sim.prevX + (sim.px - sim.prevX) * alpha;
      const py = sim.prevY + (sim.py - sim.prevY) * alpha;
      const camX = px - w * T.PLAYER_ANCHOR;

      // Letterboxed rather than stretched: the aspect ratio is part of how far
      // ahead the player can see, which is part of the difficulty.
      const k = Math.min(canvasW / w, canvasH / h);
      ctx.save();
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.translate(
        Math.round((canvasW - w * k) / 2),
        Math.round((canvasH - h * k) / 2)
      );
      ctx.scale(k, k);
      // Clipped so a shake cannot smear the scene into the bars beside it.
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();

      if (shake > 0) {
        // Rounded, so a shake never puts the whole scene on a half pixel.
        ctx.translate(
          Math.round((rng() * 2 - 1) * shake),
          Math.round((rng() * 2 - 1) * shake)
        );
      }

      ctx.fillStyle = "#04061a";
      ctx.fillRect(-16, -16, w + 32, h + 32);
      for (let i = 0; i < layers.length; i++) drawLayer(ctx, layers[i], camX);

      // The moon, drawn here and not in the sky strip: a strip repeats every
      // 512px and a moon in it is two moons on a 960px view. It is at
      // infinity, so it does not scroll at all. Two arcs.
      ctx.fillStyle = "rgba(200,214,255,0.12)";
      ctx.beginPath();
      ctx.arc(150, 84, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e6ebff";
      ctx.beginPath();
      ctx.arc(150, 84, 13, 0, Math.PI * 2);
      ctx.fill();

      // ── Platforms ──
      for (let i = 0; i < sim.chunks.length; i++) {
        const c = sim.chunks[i];
        const x = Math.round(c.x - camX);
        if (x > w || x + c.w < 0) continue;
        const sy = Math.round(surfaceY(h, c.h));
        const cw = Math.round(c.w);
        ctx.fillStyle = "#2f3a7a";
        ctx.fillRect(x, sy, cw, h - sy);
        // The plating, anchored to the platform's own corner so the seams
        // stay put on it as it scrolls rather than sliding across it.
        ctx.translate(x, sy);
        ctx.fillStyle = PLATE.fill(ctx, 48);
        ctx.fillRect(0, 0, cw, h - sy);
        ctx.fillStyle = GRAIN.fill(ctx, 64);
        ctx.fillRect(0, 0, cw, h - sy);
        ctx.translate(-x, -sy);
        // A dark underside below the lip, so the top face reads as a face.
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x, sy + 3, cw, 4);
        // A lit lip, so the surface you have to land on is the brightest edge
        // on screen. In a one-input game that edge is the only information.
        ctx.fillStyle = "#67e8f9";
        ctx.fillRect(x, sy, cw, 3);
      }

      // ── Spikes ──
      ctx.fillStyle = "#f43f5e";
      for (let i = 0; i < sim.spikePool.length; i++) {
        const sp = sim.spikePool[i];
        if (!sp.live) continue;
        const x = Math.round(sp.x - camX);
        if (x > w || x + T.SPIKE_W < 0) continue;
        const sy = Math.round(surfaceY(h, sp.h));
        ctx.beginPath();
        ctx.moveTo(x, sy);
        ctx.lineTo(x + T.SPIKE_W / 2, sy - T.SPIKE_H);
        ctx.lineTo(x + T.SPIKE_W, sy);
        ctx.closePath();
        ctx.fill();
      }

      // ── Gold ──
      // A disc with a rim and a glint, so it reads as a coin and not a
      // yellow tile. Two arcs and a rect; the disc is the expensive one and
      // there are at most a dozen on screen.
      for (let i = 0; i < sim.coinPool.length; i++) {
        const coin = sim.coinPool[i];
        if (!coin.live) continue;
        const x = Math.round(coin.x - camX);
        if (x > w || x < -T.COIN_R * 2) continue;
        const y = Math.round(coin.y);
        ctx.fillStyle = "#b45309";
        ctx.beginPath();
        ctx.arc(x, y, T.COIN_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.arc(x, y, T.COIN_R - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(x - 3, y - 4, 3, 3);
      }

      // ── Dust ──
      ctx.fillStyle = "#94a3b8";
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        if (d.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, d.life * 4);
        ctx.fillRect(Math.round(d.x - camX), Math.round(d.y), 4, 4);
      }
      ctx.globalAlpha = 1;

      // ── The runner ──
      const rx = Math.round(px - camX);
      const ry = Math.round(py);
      bevelRect(ctx, rx, ry, T.PLAYER_W, T.PLAYER_H, sim.dead ? "#f43f5e" : "#22d3ee", 3);
      // A visor, so which way it faces is legible at a glance and the box
      // reads as a character rather than as a bug.
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(rx + T.PLAYER_W - 12, ry + 8, 8, 6);

      ctx.restore();
    },

    destroy() {
      // The strips are the only retained memory: dropping the references is
      // what lets the canvases be collected rather than living as long as the
      // page does.
      layers = [];
    },
  };
}
