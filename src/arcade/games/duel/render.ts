import { enterView, fitView } from "@/arcade/host/view";
import * as T from "./tuning";
import * as R from "./ragdoll";
import type { Match } from "./match";
import { MENU, buttonsFor, type Choice, type ModeKind, type Pad } from "./controls";
import { ITEMS, ITEMS_SCALE, ROBOT, TILES, UI, VFX, type Frame } from "./art/frames";
import { TINTS, sprites, type Sprites } from "./sprites";

/**
 * The asset pack's robots in the Magma Gauntlet, and the vector fallback.
 *
 * ── Sprites on a skeleton ────────────────────────────────────────────────
 *
 * Every part of the robot is a sprite stretched along the bone the physics
 * already has: an upper arm is drawn from shoulder to elbow, rotated to the
 * bone's angle and as long as the bone is. Nothing is posed for the art,
 * which is what keeps the picture honest — the hitbox and the drawing are
 * the same line. The pack is at 1920x1088 and this view is half that, so a
 * @1x pixel is half a view pixel and the rebar's 110 px from grip to tip is
 * the 55 the physics swings.
 *
 * Back to front: far arm, far leg, torso, near leg, head, weapon, weapon
 * arm. The weapon arm is last because the weapon is the thing being read.
 *
 * ── Two robots that differ in more than colour ───────────────────────────
 *
 * Violet and amber are far apart in hue and in lightness, and the amber
 * robot wears the hard hat the pack's mockup gave it. So a player who cannot
 * separate the two colours still has the silhouette. The trail keeps its own
 * colour per player too — the ribbon is the damage readout: its width is the
 * tip's speed, and speed is what `damageFor` pays.
 *
 * ── The fallback ─────────────────────────────────────────────────────────
 *
 * If the sheets never load, `drawFilament` draws each fighter as two
 * strokes, a wide faint one and a thin bright core, with no `shadowBlur`.
 * It is the art this cabinet had before the pack arrived.
 *
 * ── Nothing allocated in `draw` ──────────────────────────────────────────
 *
 * Particles, effects, trails and interpolation buffers are typed arrays or
 * pooled objects sized once.
 */

export type Screen = "menu" | "match" | "result";

export interface Scene {
  screen: Screen;
  match: Match | null;
  mode: ModeKind;
  choice: Choice | null;
  /** Menu card the keyboard has selected, for the highlight. */
  selected: number;
  pads: readonly [Pad, Pad];
  showTouch: boolean;
  /** 0..1 between sim steps. */
  alpha: number;
  /** Seconds the result has been up. */
  resultT: number;
}

const BACKDROP = "#1a0905";
const INK = "#fff4e8";
const LAVA = "#ff5a1f";
const LAVA_DEEP = "#e8430f";
export const COLORS = [
  { glow: TINTS[0], core: "#f1e4ff", trail: "34, 211, 238" },
  { glow: TINTS[1], core: "#fff1e2", trail: "251, 146, 60" },
] as const;
/** A hat per player, from the items sheet. Null for bare-headed. */
const HATS: readonly (keyof typeof ITEMS | null)[] = [null, "head/hard_hat"];

const BONES: readonly (readonly [number, number])[] = [
  [R.NECK, R.PELVIS],
  [R.PELVIS, R.KNEE_L],
  [R.KNEE_L, R.FOOT_L],
  [R.PELVIS, R.KNEE_R],
  [R.KNEE_R, R.FOOT_R],
  [R.NECK, R.ELBOW2],
  [R.ELBOW2, R.HAND2],
  [R.NECK, R.ELBOW],
  [R.ELBOW, R.HAND],
];

const MAX_PARTS = 220;
const SPARK = ["#fff7c2", "#ffd166", "#6ff5ff", "#ffffff", "#ff8a3d"] as const;

/** Pooled sprite effects: stars, rings, splats, puffs. */
const FX_MAX = 28;
const FX_STAR = 0;
const FX_RING = 1;
const FX_SPLAT = 2;
const FX_DUST = 3;
interface Fx {
  kind: number;
  x: number;
  y: number;
  t: number;
  life: number;
  size: number;
  rot: number;
  tint: number;
}

/** Pack @1x units to view px. */
const HALF = 0.5;
const SPLATS = [VFX.ink_splat_0, VFX.ink_splat_1, VFX.ink_splat_2] as const;
const LAVA_FRAMES = [TILES.hazard_0, TILES.hazard_1, TILES.hazard_2, TILES.hazard_3] as const;

export interface Renderer {
  /** Advance particles and the eased bars. `frozen` holds the world in hit-stop. */
  step(dt: number, scene: Scene, frozen: boolean): void;
  /** Called after each match step: keeps the trails and interpolation fed. */
  record(m: Match): void;
  /** Reset the trails and interpolation, at the start of a round. */
  snap(m: Match): void;
  burst(x: number, y: number, nx: number, ny: number, n: number, speed: number, color: number): void;
  /** A sprite effect: "star" on a hit, "ring" on a heavy or a KO, "splat", "dust". */
  effect(kind: "star" | "ring" | "splat" | "dust", x: number, y: number, size: number, tint?: number): void;
  kick(nx: number, ny: number, amount: number): void;
  flash(amount: number): void;
  draw(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number): void;
  destroy(): void;
}

/** Draw a frame of a sheet into a dest rect. */
function blit(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  f: Frame,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  ctx.drawImage(img, f[0], f[1], f[2], f[3], dx, dy, dw, dh);
}

export function createRenderer(rng: () => number): Renderer {
  // Particles: x, y, vx, vy, life, max.
  const parts = new Float32Array(MAX_PARTS * 6);
  const partColor = new Uint8Array(MAX_PARTS);
  let partNext = 0;

  const fx: Fx[] = Array.from({ length: FX_MAX }, () => ({
    kind: 0, x: 0, y: 0, t: 1, life: 0, size: 0, rot: 0, tint: 0,
  }));
  let fxNext = 0;

  // Per fighter: the last two host steps' positions, for interpolation.
  const prevX = [new Float64Array(R.N), new Float64Array(R.N)];
  const prevY = [new Float64Array(R.N), new Float64Array(R.N)];
  const curX = [new Float64Array(R.N), new Float64Array(R.N)];
  const curY = [new Float64Array(R.N), new Float64Array(R.N)];
  const drawX = [new Float64Array(R.N), new Float64Array(R.N)];
  const drawY = [new Float64Array(R.N), new Float64Array(R.N)];

  // Trails: ring of tip positions and speeds.
  const trailX = [new Float32Array(T.TRAIL), new Float32Array(T.TRAIL)];
  const trailY = [new Float32Array(T.TRAIL), new Float32Array(T.TRAIL)];
  const trailS = [new Float32Array(T.TRAIL), new Float32Array(T.TRAIL)];
  let trailHead = 0;

  // Bars ease towards the truth; the white chunk lags behind them.
  const shownHp = [T.HP, T.HP];
  const lagHp = [T.HP, T.HP];

  let shake = 0;
  let shakeX = 0;
  let shakeY = 0;
  let flashA = 0;
  let clock = 0;

  function snap(m: Match) {
    for (const f of m.fighters) {
      for (let i = 0; i < R.N; i++) {
        prevX[f.id][i] = curX[f.id][i] = f.x[i];
        prevY[f.id][i] = curY[f.id][i] = f.y[i];
      }
      trailX[f.id].fill(f.x[R.TIP]);
      trailY[f.id].fill(f.y[R.TIP]);
      trailS[f.id].fill(0);
      shownHp[f.id] = lagHp[f.id] = f.hp;
    }
  }

  function record(m: Match) {
    trailHead = (trailHead + 1) % T.TRAIL;
    for (const f of m.fighters) {
      const id = f.id;
      for (let i = 0; i < R.N; i++) {
        prevX[id][i] = curX[id][i];
        prevY[id][i] = curY[id][i];
        curX[id][i] = f.x[i];
        curY[id][i] = f.y[i];
      }
      trailX[id][trailHead] = f.x[R.TIP];
      trailY[id][trailHead] = f.y[R.TIP];
      trailS[id][trailHead] = f.tipSpeed;
    }
  }

  function burst(x: number, y: number, nx: number, ny: number, n: number, speed: number, color: number) {
    for (let k = 0; k < n; k++) {
      const o = partNext * 6;
      const a = Math.atan2(ny, nx) + (rng() - 0.5) * 1.6;
      const v = speed * (0.35 + rng() * 0.8);
      parts[o] = x;
      parts[o + 1] = y;
      parts[o + 2] = Math.cos(a) * v;
      parts[o + 3] = Math.sin(a) * v;
      const life = 0.25 + rng() * 0.35;
      parts[o + 4] = life;
      parts[o + 5] = life;
      partColor[partNext] = color % SPARK.length;
      partNext = (partNext + 1) % MAX_PARTS;
    }
  }

  // ── The arena ───────────────────────────────────────────────────────────

  function drawBackground(ctx: CanvasRenderingContext2D, s: Sprites | null) {
    if (s) {
      ctx.drawImage(s.bgFar, 0, 0, T.VIEW_W, T.VIEW_H);
      ctx.drawImage(s.bgMid, 0, T.VIEW_H / 2, T.VIEW_W, T.VIEW_H / 2);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, T.VIEW_H);
    g.addColorStop(0, "#2a0f08");
    g.addColorStop(1, "#8a2e0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, T.VIEW_W, T.VIEW_H);
  }

  function drawBlocks(ctx: CanvasRenderingContext2D, m: Match, s: Sprites | null) {
    const t = m.arena.tile;
    const each = (r: { x0: number; y0: number; x1: number; y1: number; oneWay?: boolean }) => {
      if (!s) {
        ctx.fillStyle = "#fce14b";
        ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
        ctx.fillStyle = "#b8960f";
        ctx.fillRect(r.x0, r.y1 - 3, r.x1 - r.x0, 3);
        return;
      }
      const rows = Math.round((r.y1 - r.y0) / t);
      for (let row = 0; row < rows; row++) {
        const f = rows === 1 ? TILES.tile_single : row === 0 ? TILES.tile_top : TILES.tile_fill;
        for (let x = r.x0; x < r.x1 - 0.5; x += t) blit(ctx, s.tiles, f, x, r.y0 + row * t, t, t);
      }
    };
    for (const r of m.arena.solids) each(r);
    for (const r of m.movers) each(r);
  }

  function drawLava(ctx: CanvasRenderingContext2D, m: Match, s: Sprites | null) {
    const lava = m.lava;
    const L = m.arena.lava;
    if (lava.phase === "tell") {
      // The tell: a line where it will reach, pulsing faster as it nears.
      const k = Math.min(1, lava.t / L.tell);
      const blink = 0.5 + 0.5 * Math.sin(clock * (8 + k * 16));
      ctx.fillStyle = `rgba(255, 90, 31, ${0.12 + 0.18 * k * blink})`;
      ctx.fillRect(0, L.peakY, T.VIEW_W, lava.y - L.peakY);
      ctx.fillStyle = `rgba(255, 210, 120, ${0.4 + 0.5 * blink})`;
      for (let x = 8; x < T.VIEW_W; x += 32) ctx.fillRect(x, L.peakY - 1, 16, 3);
    }
    const y = lava.y;
    ctx.fillStyle = LAVA;
    ctx.fillRect(0, y + 6, T.VIEW_W, T.VIEW_H - y);
    ctx.fillStyle = LAVA_DEEP;
    ctx.fillRect(0, y + 40, T.VIEW_W, T.VIEW_H - y);
    if (s) {
      const frame = LAVA_FRAMES[Math.floor(clock * 6) % 4];
      for (let x = 0; x < T.VIEW_W; x += 64) blit(ctx, s.tiles, frame, x, y - 4, 64, 16);
    } else {
      ctx.fillStyle = "#ffd27a";
      ctx.fillRect(0, y, T.VIEW_W, 3);
    }
  }

  // ── Fighters ────────────────────────────────────────────────────────────

  function lerpFighter(id: 0 | 1, alpha: number) {
    for (let i = 0; i < R.N; i++) {
      drawX[id][i] = prevX[id][i] + (curX[id][i] - prevX[id][i]) * alpha;
      drawY[id][i] = prevY[id][i] + (curY[id][i] - prevY[id][i]) * alpha;
    }
  }

  function drawTrail(ctx: CanvasRenderingContext2D, id: 0 | 1) {
    const c = COLORS[id];
    ctx.lineCap = "round";
    for (let k = 1; k < T.TRAIL; k++) {
      const a = (trailHead - k + 1 + T.TRAIL) % T.TRAIL;
      const b = (trailHead - k + T.TRAIL) % T.TRAIL;
      const sp = trailS[id][a];
      if (sp < 380) continue;
      const fade = 1 - k / T.TRAIL;
      ctx.strokeStyle = `rgba(${c.trail}, ${Math.min(0.8, (sp / 1800) * fade)})`;
      ctx.lineWidth = 2 + Math.min(16, sp / 110) * fade;
      ctx.beginPath();
      ctx.moveTo(trailX[id][a], trailY[id][a]);
      ctx.lineTo(trailX[id][b], trailY[id][b]);
      ctx.stroke();
    }
  }

  /** A sprite stretched along a bone, `over` px past each end so joints overlap. */
  function bone(ctx: CanvasRenderingContext2D, img: CanvasImageSource, X: Float64Array, Y: Float64Array, a: number, b: number, w: number, over: number) {
    const dx = X[b] - X[a];
    const dy = Y[b] - Y[a];
    const len = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(X[a], Y[a]);
    ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    ctx.drawImage(img, -w / 2, -over, w, len + over * 2);
    ctx.restore();
  }

  function drawWeapon(ctx: CanvasRenderingContext2D, s: Sprites, f: R.Fighter, X: Float64Array, Y: Float64Array) {
    const frame = ITEMS[f.weapon.sprite as keyof typeof ITEMS];
    if (!frame) return;
    const a = Math.atan2(Y[R.TIP] - Y[R.HAND], X[R.TIP] - X[R.HAND]);
    ctx.save();
    ctx.translate(X[R.HAND], Y[R.HAND]);
    ctx.rotate(a);
    // Held right way up: a weapon swung to the left is flipped, not inverted.
    if (Math.cos(a) < 0) ctx.scale(1, -1);
    // Grip at (10, 16) @1x; 128x32 @1x drawn at half.
    const w = (frame[2] / ITEMS_SCALE) * HALF;
    const h = (frame[3] / ITEMS_SCALE) * HALF;
    blit(ctx, s.items, frame, -10 * HALF, -16 * HALF, w, h);
    ctx.restore();
    if (f.windup > 0) {
      // The tell for a heavy: light gathering on the weapon. Additive, from
      // the pack's baked glow, so it costs one draw and no blur.
      const k = Math.min(1, f.windup / T.HEAVY_FULL);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.55 * k;
      const r = 12 + k * 22;
      blit(ctx, s.vfx, VFX.glow_disc, X[R.TIP] - r, Y[R.TIP] - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  function drawRobot(ctx: CanvasRenderingContext2D, s: Sprites, f: R.Fighter) {
    const id = f.id;
    const X = drawX[id];
    const Y = drawY[id];
    const tint = s.tinted[id];
    const fc = f.facing;
    ctx.globalAlpha = f.ko ? 0.8 : 1;
    // Nearer the camera is the side the fighter faces away from us: the
    // weapon arm and the leg on the facing side.
    const [farKnee, farFoot, nearKnee, nearFoot] = fc === 1 ? [R.KNEE_L, R.FOOT_L, R.KNEE_R, R.FOOT_R] : [R.KNEE_R, R.FOOT_R, R.KNEE_L, R.FOOT_L];

    // Far arm, far leg.
    bone(ctx, tint.upper, X, Y, R.NECK, R.ELBOW2, 8, 3);
    bone(ctx, tint.lower, X, Y, R.ELBOW2, R.HAND2, 8, 3);
    ctx.drawImage(tint.hand, X[R.HAND2] - 5, Y[R.HAND2] - 5, 10, 10);
    bone(ctx, tint.upper, X, Y, R.PELVIS, farKnee, 9, 3);
    bone(ctx, tint.lower, X, Y, farKnee, farFoot, 9, 3);
    foot(ctx, tint.foot, X[farFoot], Y[farFoot], fc);

    // Torso.
    {
      const dx = X[R.PELVIS] - X[R.NECK];
      const dy = Y[R.PELVIS] - Y[R.NECK];
      const len = Math.hypot(dx, dy);
      ctx.save();
      ctx.translate((X[R.NECK] + X[R.PELVIS]) / 2, (Y[R.NECK] + Y[R.PELVIS]) / 2);
      ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      if (fc === -1) ctx.scale(-1, 1);
      const w = 20;
      const h = len + 12;
      blit(ctx, s.robot, ROBOT["robot/torso"], -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Near leg.
    bone(ctx, tint.upper, X, Y, R.PELVIS, nearKnee, 9, 3);
    bone(ctx, tint.lower, X, Y, nearKnee, nearFoot, 9, 3);
    foot(ctx, tint.foot, X[nearFoot], Y[nearFoot], fc);

    // Head, turned with the neck, and the hat on it.
    {
      const tilt = Math.atan2(Y[R.HEAD] - Y[R.NECK], X[R.HEAD] - X[R.NECK]) + Math.PI / 2;
      ctx.save();
      ctx.translate(X[R.HEAD], Y[R.HEAD]);
      ctx.rotate(tilt);
      if (fc === -1) ctx.scale(-1, 1);
      const sz = 30;
      blit(ctx, s.robot, f.ko ? ROBOT["robot/head_ko"] : ROBOT["robot/head"], -sz / 2, -sz * 0.6, sz, sz);
      const hat = HATS[id];
      if (hat) blit(ctx, s.items, ITEMS[hat], -sz / 2, -sz * 1.02, sz, sz);
      ctx.restore();
    }

    // The weapon, then the arm holding it.
    drawWeapon(ctx, s, f, X, Y);
    bone(ctx, tint.upper, X, Y, R.NECK, R.ELBOW, 8, 3);
    bone(ctx, tint.lower, X, Y, R.ELBOW, R.HAND, 8, 3);
    ctx.drawImage(tint.hand, X[R.HAND] - 6, Y[R.HAND] - 6, 12, 12);

    if (f.stun > 0 && !f.ko) {
      for (let k = 0; k < 3; k++) {
        const a = clock * 7 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(X[R.HEAD] + Math.cos(a) * 14 - 2, Y[R.HEAD] - 20 + Math.sin(a) * 4 - 2, 4, 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  function foot(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, fc: number) {
    ctx.save();
    ctx.translate(x, y);
    if (fc === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -5, -5, 16, 10);
    ctx.restore();
  }

  function bonesPath(ctx: CanvasRenderingContext2D, id: 0 | 1) {
    const X = drawX[id];
    const Y = drawY[id];
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(X[a], Y[a]);
      ctx.lineTo(X[b], Y[b]);
    }
  }

  /** The fallback: two strokes per bone, no blur. */
  function drawFilament(ctx: CanvasRenderingContext2D, f: R.Fighter) {
    const id = f.id;
    const c = COLORS[id];
    const X = drawX[id];
    const Y = drawY[id];
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const base = f.ko ? 0.55 : 1;
    ctx.globalAlpha = base;
    ctx.strokeStyle = "#dfe6ff";
    ctx.lineWidth = f.weapon.tipR > 6 ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(X[R.HAND], Y[R.HAND]);
    ctx.lineTo(X[R.TIP], Y[R.TIP]);
    ctx.stroke();
    if (f.weapon.tipR > 6) {
      ctx.fillStyle = "#8fa3d9";
      ctx.fillRect(X[R.TIP] - f.weapon.tipR * 0.7, Y[R.TIP] - f.weapon.tipR, f.weapon.tipR * 1.4, f.weapon.tipR * 2);
    }
    if (f.windup > 0) {
      const k = Math.min(1, f.windup / T.HEAVY_FULL);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + 0.5 * k})`;
      ctx.beginPath();
      ctx.arc(X[R.TIP], Y[R.TIP], 4 + k * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    bonesPath(ctx, id);
    ctx.strokeStyle = c.glow;
    ctx.globalAlpha = base * 0.28;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.globalAlpha = base;
    ctx.strokeStyle = f.stun > 0 ? "#ffffff" : c.core;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X[R.HEAD], Y[R.HEAD], T.HEAD_R, 0, Math.PI * 2);
    ctx.fillStyle = c.glow;
    ctx.fill();
    ctx.strokeStyle = c.core;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = c.core;
    ctx.fillRect(X[R.HEAD] + f.facing * 3 - 1.5, Y[R.HEAD] - 2.5, 3, 3);
    ctx.globalAlpha = 1;
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  function drawParticles(ctx: CanvasRenderingContext2D) {
    for (let k = 0; k < MAX_PARTS; k++) {
      const o = k * 6;
      const life = parts[o + 4];
      if (life <= 0) continue;
      ctx.globalAlpha = Math.min(1, life / parts[o + 5] + 0.1);
      ctx.fillStyle = SPARK[partColor[k]];
      ctx.fillRect(parts[o] - 1.5, parts[o + 1] - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(ctx: CanvasRenderingContext2D, s: Sprites | null) {
    for (const e of fx) {
      if (e.t >= e.life) continue;
      const k = e.t / e.life;
      if (!s) {
        ctx.strokeStyle = `rgba(255, 244, 200, ${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * (0.4 + k), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      let frame: Frame = VFX.hit_star;
      let size = e.size;
      if (e.kind === FX_STAR) {
        // In fast, out slow: the star is biggest on the frame of the hit.
        size = e.size * (1.15 - 0.6 * k);
        ctx.globalCompositeOperation = "lighter";
      } else if (e.kind === FX_RING) {
        frame = VFX.shock_ring;
        size = e.size * (0.3 + 1.2 * k);
        ctx.globalCompositeOperation = "lighter";
      } else if (e.kind === FX_SPLAT) {
        frame = SPLATS[e.tint % 3];
      } else {
        frame = VFX.dust_puff;
        size = e.size * (0.6 + 0.6 * k);
      }
      ctx.globalAlpha = 1 - k * k;
      blit(ctx, s.vfx, frame, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── HUD, messages, controls ─────────────────────────────────────────────

  function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, lag: number, color: string, flip: boolean) {
    ctx.fillStyle = "rgba(20, 8, 6, 0.85)";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    const fw = w * Math.max(0, k);
    const lw = w * Math.max(0, lag);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(flip ? x + w - lw : x, y, lw, h);
    ctx.fillStyle = color;
    ctx.fillRect(flip ? x + w - fw : x, y, fw, h);
  }

  function drawHud(ctx: CanvasRenderingContext2D, m: Match, mode: ModeKind) {
    const W = 340;
    for (const f of m.fighters) {
      const flip = f.id === 1;
      const x = flip ? T.VIEW_W - 24 - W : 24;
      bar(ctx, x, 18, W, 14, shownHp[f.id] / T.HP, lagHp[f.id] / T.HP, COLORS[f.id].glow, flip);
      const tired = f.tired && Math.sin(clock * 14) > 0;
      const sw = W * 0.6;
      bar(ctx, flip ? x + W - sw : x, 38, sw, 5, f.stamina / T.STAMINA_MAX, 0, tired ? "#ff5a5a" : "#6ff5ff", flip);
      ctx.fillStyle = INK;
      ctx.font = "700 13px ui-monospace, monospace";
      ctx.textBaseline = "top";
      ctx.textAlign = flip ? "right" : "left";
      ctx.fillText(nameOf(f.id, mode), flip ? T.VIEW_W - 24 : 24, 50);
      for (let k = 0; k < T.ROUNDS_TO_WIN; k++) {
        const px = flip ? T.VIEW_W - 64 - k * 16 : 64 + k * 16;
        ctx.beginPath();
        ctx.arc(px, 57, 5, 0, Math.PI * 2);
        if (k < m.wins[f.id]) {
          ctx.fillStyle = COLORS[f.id].glow;
          ctx.fill();
        } else {
          ctx.strokeStyle = "rgba(255, 244, 232, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
    ctx.textAlign = "center";
    ctx.font = "700 26px ui-monospace, monospace";
    ctx.fillStyle = m.clock <= 10 && m.phase === "fight" ? "#ffd27a" : INK;
    ctx.fillText(String(Math.ceil(m.clock)), T.VIEW_W / 2, 12);
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255, 244, 232, 0.7)";
    ctx.fillText(`ROUND ${m.round} · ${m.fighters[0].weapon.name.toUpperCase()}`, T.VIEW_W / 2, 42);
  }

  function banner(ctx: CanvasRenderingContext2D, text: string, sub: string | null, color: string = INK) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 64px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(20, 8, 6, 0.6)";
    ctx.fillText(text, T.VIEW_W / 2 + 3, 173);
    ctx.fillStyle = color;
    ctx.fillText(text, T.VIEW_W / 2, 170);
    if (sub) {
      ctx.font = "600 18px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255, 244, 232, 0.9)";
      ctx.fillText(sub, T.VIEW_W / 2, 220);
    }
  }

  function drawMessages(ctx: CanvasRenderingContext2D, m: Match, mode: ModeKind) {
    if (m.phase === "intro") {
      banner(ctx, m.phaseT < T.INTRO_TIME * 0.6 ? `ROUND ${m.round}` : "FIGHT", null);
    } else if (m.phase === "fight" && m.phaseT < 0.5) {
      banner(ctx, "FIGHT", null);
    } else if (m.phase === "fight" && m.lava.phase === "tell") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 16px ui-monospace, monospace";
      ctx.fillStyle = Math.sin(clock * 16) > 0 ? "#ffd27a" : "#ff8a3d";
      ctx.fillText("LAVA RISING", T.VIEW_W / 2, 84);
    } else if (m.phase === "ko") {
      const text = m.cause === "lava" ? "BURNED" : m.cause === "time" ? "TIME" : m.cause === "draw" ? "DOUBLE K.O." : "K.O.";
      const w = m.roundWinner;
      const who = w === null ? "No one takes the round" : `${nameOf(w, mode)} ${mode === "cpu" && w === 0 ? "take" : "takes"} the round`;
      banner(ctx, text, who, w === null ? INK : COLORS[w].glow);
    } else if (m.phase === "over") {
      const w = m.winner;
      const text = w === null ? "DRAW" : mode === "cpu" ? (w === 0 ? "YOU WIN" : "CPU WINS") : `${nameOf(w, mode)} WINS`;
      banner(ctx, text, `${m.wins[0]} – ${m.wins[1]}`, w === null ? INK : COLORS[w].glow);
    }
  }

  function drawTouch(ctx: CanvasRenderingContext2D, scene: Scene, s: Sprites | null) {
    for (const p of scene.pads) {
      if (!p.active) continue;
      if (s) {
        const b = T.STICK_R * 2 + 24;
        ctx.globalAlpha = 0.85;
        blit(ctx, s.ui, UI["ctl/joystick_base"], p.ox - b / 2, p.oy - b / 2, b, b);
        blit(ctx, s.ui, UI["ctl/joystick_knob"], p.kx - 26, p.ky - 26, 52, 52);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = "rgba(255, 244, 232, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.ox, p.oy, T.STICK_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 244, 232, 0.45)";
        ctx.beginPath();
        ctx.arc(p.kx, p.ky, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!scene.showTouch) return;
    const m = scene.match;
    for (const b of buttonsFor(scene.mode)) {
      const pad = scene.pads[b.player];
      const held = pad.held[b.kind];
      const d = b.r * 2;
      if (s) {
        const charging = b.kind === "heavy" && m ? m.fighters[b.player].windup > 0 : false;
        const frame =
          b.kind === "jump"
            ? held ? UI["ctl/btn_jump_pressed"] : UI["ctl/btn_jump"]
            : held || charging ? UI["ctl/btn_ability_ready"] : UI["ctl/btn_ability"];
        ctx.globalAlpha = held ? 1 : 0.85;
        blit(ctx, s.ui, frame, b.x - b.r, b.y - b.r, d, d);
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = held ? `rgba(${COLORS[b.player].trail}, 0.45)` : "rgba(255, 244, 232, 0.12)";
        ctx.fill();
        ctx.strokeStyle = `rgba(${COLORS[b.player].trail}, 0.8)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.font = "800 12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.kind === "jump" ? "JUMP" : "SKILL", b.x, b.y);
      }
    }
  }

  function drawMenu(ctx: CanvasRenderingContext2D, scene: Scene) {
    ctx.fillStyle = "rgba(20, 8, 6, 0.45)";
    ctx.fillRect(0, 0, T.VIEW_W, T.VIEW_H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 58px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = COLORS[1].glow;
    ctx.fillText("RAGDOLL RUMBLE", T.VIEW_W / 2 + 3, 123);
    ctx.fillStyle = INK;
    ctx.fillText("RAGDOLL RUMBLE", T.VIEW_W / 2, 120);
    ctx.font = "600 16px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 244, 232, 0.85)";
    ctx.fillText("Swing with the stick. Hold SKILL to wind up a heavy. Stay out of the lava.", T.VIEW_W / 2, 178);
    MENU.forEach((card, i) => {
      const on = i === scene.selected;
      ctx.fillStyle = on ? "rgba(242, 157, 12, 0.28)" : "rgba(26, 10, 6, 0.85)";
      ctx.fillRect(card.x, card.y, card.w, card.h);
      ctx.strokeStyle = on ? "#fce14b" : "rgba(252, 225, 75, 0.35)";
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.strokeRect(card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1);
      ctx.fillStyle = card.choice.kind === "versus" ? "#6ff5ff" : INK;
      ctx.font = "800 24px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(card.label, card.x + card.w / 2, card.y + card.h / 2 - 10);
      ctx.font = "600 13px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255, 244, 232, 0.7)";
      ctx.fillText(card.sub, card.x + card.w / 2, card.y + card.h / 2 + 20);
      if (!scene.showTouch) {
        ctx.font = "700 11px ui-monospace, monospace";
        ctx.fillText(String(i + 1), card.x + 14, card.y + 14);
      }
    });
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 244, 232, 0.75)";
    ctx.fillText(
      scene.showTouch
        ? "Drag on your side to move and swing · a small push aims without stepping"
        : "Solo: WASD or arrows · Space jump · F or Shift skill   ·   Versus: WASD Space F  vs  arrows Enter RShift",
      T.VIEW_W / 2,
      420
    );
  }

  function drawResult(ctx: CanvasRenderingContext2D, s: Sprites | null) {
    // Versus only: a CPU match hands over to the host's own result panel.
    for (const b of RESULT_BUTTONS) {
      ctx.fillStyle = "rgba(26, 10, 6, 0.9)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = b.action === "rematch" ? "#6ff5ff" : "#fce14b";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      if (s && b.action === "rematch") blit(ctx, s.ui, UI["ctl/btn_rematch"], b.x + 8, b.y + 8, b.h - 16, b.h - 16);
      ctx.fillStyle = INK;
      ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.action === "rematch" ? "REMATCH" : "MENU", b.x + b.w / 2 + (s && b.action === "rematch" ? 18 : 0), b.y + b.h / 2);
    }
    ctx.font = "600 12px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255, 244, 232, 0.65)";
    ctx.fillText("Space for a rematch · M for the menu", T.VIEW_W / 2, RESULT_BUTTONS[0].y + 90);
  }

  return {
    step(dt, scene, frozen) {
      clock += dt;
      if (shake > 0) shake = Math.max(0, shake - (T.SHAKE_MAX / T.SHAKE_DECAY) * dt);
      if (flashA > 0) flashA = Math.max(0, flashA - dt * 3);
      const m = scene.match;
      if (m) {
        for (const f of m.fighters) {
          shownHp[f.id] += (f.hp - shownHp[f.id]) * Math.min(1, dt * 18);
          if (lagHp[f.id] > shownHp[f.id]) lagHp[f.id] = Math.max(shownHp[f.id], lagHp[f.id] - dt * 40);
          else lagHp[f.id] = shownHp[f.id];
        }
      }
      if (frozen) return;
      for (const e of fx) if (e.t < e.life) e.t += dt;
      for (let k = 0; k < MAX_PARTS; k++) {
        const o = k * 6;
        if (parts[o + 4] <= 0) continue;
        parts[o + 4] -= dt;
        parts[o + 2] *= 0.94;
        parts[o + 3] = parts[o + 3] * 0.94 + 900 * dt;
        parts[o] += parts[o + 2] * dt;
        parts[o + 1] += parts[o + 3] * dt;
      }
    },
    record,
    snap,
    burst,
    effect(kind, x, y, size, tint = 0) {
      const e = fx[fxNext];
      fxNext = (fxNext + 1) % FX_MAX;
      e.kind = kind === "star" ? FX_STAR : kind === "ring" ? FX_RING : kind === "splat" ? FX_SPLAT : FX_DUST;
      e.x = x;
      e.y = y;
      e.t = 0;
      e.life = kind === "ring" ? 0.45 : kind === "splat" ? 0.9 : kind === "dust" ? 0.4 : 0.28;
      e.size = size;
      e.rot = kind === "star" ? 0 : rng() * Math.PI * 2;
      e.tint = tint;
    },
    kick(nx, ny, amount) {
      shake = Math.min(T.SHAKE_MAX, Math.max(shake, amount));
      shakeX = nx;
      shakeY = ny;
    },
    flash(amount) {
      flashA = Math.max(flashA, amount);
    },
    draw(ctx, scene, w, h) {
      const s = sprites();
      const v = fitView(w, h, T.VIEW_W, T.VIEW_H);
      enterView(ctx, v, w, h, BACKDROP);
      drawBackground(ctx, s);

      const m = scene.match;
      if (scene.screen === "menu" || !m) {
        drawMenu(ctx, scene);
        ctx.restore();
        return;
      }

      ctx.save();
      if (shake > 0) {
        // Kicked along the blow, with a little wobble across it.
        const wob = Math.sin(clock * 60) * shake * 0.3;
        ctx.translate(shakeX * shake - shakeY * wob, shakeY * shake + shakeX * wob);
      }
      drawBlocks(ctx, m, s);
      for (const f of m.fighters) {
        lerpFighter(f.id, scene.alpha);
        drawTrail(ctx, f.id);
      }
      // The one who is down is drawn first, under the one standing.
      const [a, b] = m.fighters;
      const order = a.ko && !b.ko ? [a, b] : [b, a];
      for (const f of order) {
        if (s) drawRobot(ctx, s, f);
        else drawFilament(ctx, f);
      }
      drawLava(ctx, m, s);
      drawFx(ctx, s);
      drawParticles(ctx);
      ctx.restore();

      drawHud(ctx, m, scene.mode);
      drawMessages(ctx, m, scene.mode);
      if (scene.screen === "result" && scene.mode === "versus" && scene.resultT > 0.6) drawResult(ctx, s);
      else drawTouch(ctx, scene, s);

      if (flashA > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashA * 0.35})`;
        ctx.fillRect(0, 0, T.VIEW_W, T.VIEW_H);
      }
      ctx.restore();
    },
    destroy() {
      partNext = 0;
      parts.fill(0);
      for (const e of fx) e.t = e.life;
    },
  };
}

export function nameOf(id: 0 | 1, mode: ModeKind): string {
  if (mode === "cpu") return id === 0 ? "YOU" : "CPU";
  return id === 0 ? "P1" : "P2";
}

/** Result-screen buttons, shared with the input seam. */
export const RESULT_BUTTONS = [
  { action: "rematch" as const, x: T.VIEW_W / 2 - 200, y: 300, w: 180, h: 64 },
  { action: "menu" as const, x: T.VIEW_W / 2 + 20, y: 300, w: 180, h: 64 },
];
