import * as T from "./tuning";
import { radiusOf, type Orb, type Sim } from "./sim";
import { enterView, fitView } from "@/arcade/host/view";

/**
 * SwarmRush's drawing, and nothing else.
 *
 * ── Two coordinate spaces ────────────────────────────────────────────────
 *
 * The world is drawn under a camera transform — translate to the view's
 * centre, scale by the zoom, translate by minus the camera — so an orb draws
 * itself at its own coordinates and its own radius and the camera does the
 * rest. The HUD is drawn afterwards in plain view pixels. Anything that has
 * to be a fixed size on screen (the name over a bot, the dash arc) sets its
 * line width or font *divided by the zoom* inside the world pass.
 *
 * ── Interpolated, not sampled ────────────────────────────────────────────
 *
 * Every orb carries where it was last step; the renderer draws it `alpha`
 * of the way from there to here. Sixty steps a second on a 144 Hz panel
 * would otherwise repeat frames and read as a stutter on exactly the thing
 * the player watches most — their own orb.
 *
 * ── No allocation in `draw` ──────────────────────────────────────────────
 *
 * Particles are a pool. The pellets are drawn as four paths (one per colour
 * bucket) rather than six hundred fills. The vignette gradient is made once
 * per context. `draw` assigns numbers and calls canvas methods.
 */

const PLAYER = "#6ff5ff";
const PLAYER_DIM = "#2a8f9a";
const THREAT = "#ff3d6a";
const PREY = "#7dffb0";
const MATTER_COLOURS = ["#ffd166", "#7dffb0", "#ff8fd6", "#8fb8ff"];
const STORM = "rgba(140, 30, 90, 0.5)";
const STORM_EDGE = "#ff5aa0";

const PARTICLES = 240;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  colour: string;
}

/** The two edge tints, made once per context: a threat at hand, and the storm. */
const vignettes = new WeakMap<CanvasRenderingContext2D, { threat: CanvasGradient; storm: CanvasGradient }>();

function vignetteFor(ctx: CanvasRenderingContext2D) {
  let v = vignettes.get(ctx);
  if (!v) {
    const make = (r: number, g: number, b: number) => {
      const grad = ctx.createRadialGradient(
        T.VIEW_W / 2, T.VIEW_H / 2, T.VIEW_H * 0.3,
        T.VIEW_W / 2, T.VIEW_H / 2, T.VIEW_H * 0.85
      );
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},1)`);
      return grad;
    };
    v = { threat: make(255, 40, 80), storm: make(160, 40, 130) };
    vignettes.set(ctx, v);
  }
  return v;
}

export interface Renderer {
  draw(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    alpha: number,
    shake: number,
    threat: number,
    canvasW: number,
    canvasH: number
  ): void;
  /** A burst of motes at a world position. Called from the seam, not here. */
  burst(x: number, y: number, colour: string, n: number, speed?: number): void;
  /** A full-screen flash, 0..1, decaying. */
  flash(strength: number): void;
  step(dt: number): void;
  destroy(): void;
}

export function createRenderer(rng: () => number): Renderer {
  const pool: Particle[] = [];
  for (let i = 0; i < PARTICLES; i++) {
    pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, colour: PLAYER });
  }
  let next = 0;
  let flashAmt = 0;
  /** Seconds since the renderer was made, for pulses. */
  let clock = 0;

  const burst: Renderer["burst"] = (x, y, colour, n, speed = 160) => {
    for (let i = 0; i < n; i++) {
      const p = pool[next];
      next = (next + 1) % PARTICLES;
      const a = rng() * Math.PI * 2;
      const v = speed * (0.4 + rng() * 0.8);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.max = p.life = 0.35 + rng() * 0.4;
      p.size = 2 + rng() * 3;
      p.colour = colour;
    }
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  function orbX(o: Orb, alpha: number) {
    return lerp(o.px, o.x, alpha);
  }
  function orbY(o: Orb, alpha: number) {
    return lerp(o.py, o.y, alpha);
  }

  function drawOrb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke: string,
    zoom: number,
    squash = 0
  ) {
    ctx.save();
    ctx.translate(x, y);
    if (squash > 0) {
      const s = squash / T.SQUASH_STEPS;
      ctx.scale(1 + 0.14 * s, 1 - 0.1 * s);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5 / zoom, r * 0.08);
    ctx.strokeStyle = stroke;
    ctx.stroke();
    // A highlight, so the orb reads as a sphere rather than a disc.
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.32, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
    ctx.restore();
  }

  function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, w: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  function drawWorld(ctx: CanvasRenderingContext2D, sim: Sim, alpha: number, zoom: number, camX: number, camY: number) {
    const half = sim.world / 2;
    // The visible rectangle of the world, for culling.
    const vw = T.VIEW_W / zoom / 2;
    const vh = T.VIEW_H / zoom / 2;
    const x0 = Math.max(-half, camX - vw);
    const x1 = Math.min(half, camX + vw);
    const y0 = Math.max(-half, camY - vh);
    const y1 = Math.min(half, camY + vh);

    // Floor and grid.
    ctx.fillStyle = "#0b1022";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = "rgba(120, 140, 220, 0.10)";
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let gx = Math.ceil(x0 / T.GRID) * T.GRID; gx <= x1; gx += T.GRID) {
      ctx.moveTo(gx, y0);
      ctx.lineTo(gx, y1);
    }
    for (let gy = Math.ceil(y0 / T.GRID) * T.GRID; gy <= y1; gy += T.GRID) {
      ctx.moveTo(x0, gy);
      ctx.lineTo(x1, gy);
    }
    ctx.stroke();
    // The edge of the world.
    ctx.strokeStyle = "rgba(160, 180, 255, 0.35)";
    ctx.lineWidth = 3 / zoom;
    ctx.strokeRect(-half, -half, sim.world, sim.world);

    // Spikes.
    for (const s of sim.spikes) {
      if (s.x + s.r < x0 || s.x - s.r > x1 || s.y + s.r < y0 || s.y - s.r > y1) continue;
      ctx.beginPath();
      const teeth = 12;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? s.r : s.r * 0.72;
        const px = s.x + Math.cos(a) * rr;
        const py = s.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(110, 20, 40, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "#ff3d6a";
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
    }

    // Matter, one path per colour.
    const m = sim.matter;
    for (let hue = 0; hue < MATTER_COLOURS.length; hue++) {
      ctx.beginPath();
      for (let i = 0; i < m.n; i++) {
        if (m.hue[i] !== hue) continue;
        const px = m.x[i];
        const py = m.y[i];
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        ctx.moveTo(px + T.MATTER_R, py);
        ctx.arc(px, py, T.MATTER_R, 0, Math.PI * 2);
      }
      ctx.fillStyle = MATTER_COLOURS[hue];
      ctx.fill();
    }

    // The storm: everything outside the ring, darkened, with a lit edge.
    if (Number.isFinite(sim.ring)) {
      ctx.beginPath();
      ctx.rect(-half - 50, -half - 50, sim.world + 100, sim.world + 100);
      ctx.arc(0, 0, sim.ring, 0, Math.PI * 2, true);
      ctx.fillStyle = STORM;
      ctx.fill("evenodd");
      const pulse = 0.6 + 0.4 * Math.sin(clock * 6);
      ring(ctx, 0, 0, sim.ring, STORM_EDGE, (3 + 3 * pulse) / zoom);
    }

    // Bots.
    const me = sim.dead ? 0 : sim.mass();
    let myR = 0;
    for (const c of sim.cells) myR = Math.max(myR, radiusOf(c.mass));
    for (const b of sim.bots) {
      if (!b.alive) continue;
      const r = radiusOf(b.mass);
      const bx = orbX(b, alpha);
      const by = orbY(b, alpha);
      if (bx + r < x0 || bx - r > x1 || by + r < y0 || by - r > y1) continue;
      const fill = `hsl(${b.hue} 70% 52%)`;
      const stroke = `hsl(${b.hue} 80% 30%)`;
      if (b.boost > 0) trail(ctx, b, bx, by, r, fill);
      drawOrb(ctx, bx, by, r, fill, stroke, zoom);
      if (!sim.dead) {
        // The doc's warning glow: a bigger orb is outlined in red from far
        // away, so a near miss reads as skill rather than luck. Prey gets a
        // faint green, so the decision is visible before it is made.
        if (b.mass >= T.EAT_RATIO * me) ring(ctx, bx, by, r + 6 / zoom, THREAT, 2.5 / zoom);
        else if (me >= T.EAT_RATIO * b.mass) ring(ctx, bx, by, r + 4 / zoom, "rgba(125,255,176,0.45)", 1.5 / zoom);
      }
      if (r * zoom > 14) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `600 ${Math.max(11, Math.min(18, r * zoom * 0.5)) / zoom}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.name, bx, by);
      }
    }

    // The player.
    if (!sim.dead) {
      for (const c of sim.cells) {
        const r = radiusOf(c.mass);
        const cx = orbX(c, alpha);
        const cy = orbY(c, alpha);
        if (c.boost > 0) trail(ctx, c, cx, cy, r, PLAYER);
        drawOrb(ctx, cx, cy, r, PLAYER, PLAYER_DIM, zoom, c.squash);
        // Dash readiness, as an arc around the orb: full circle when ready.
        const ready = c.dashCd <= 0 ? 1 : 1 - c.dashCd / T.DASH_CD_S;
        if (ready < 1) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 5 / zoom, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();
        }
        // Spawn protection: a dashed ring that thins as it runs out.
        if (c.shield > 0) {
          ctx.save();
          ctx.setLineDash([6 / zoom, 5 / zoom]);
          ctx.lineDashOffset = -clock * 40;
          ring(ctx, cx, cy, r + 9 / zoom, "rgba(255,255,255,0.7)", (1 + 2 * (c.shield / T.SPAWN_SHIELD_S)) / zoom);
          ctx.restore();
        }
        // Halves waiting to merge show the wait.
        if (c.mergeIn > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.5, -Math.PI / 2, -Math.PI / 2 + (1 - c.mergeIn / T.SPLIT_MERGE_S) * Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 3 / zoom;
          ctx.stroke();
        }
      }
    }

    // Particles.
    for (const p of pool) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.life / p.max);
      ctx.fillStyle = p.colour;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function trail(ctx: CanvasRenderingContext2D, o: Orb, x: number, y: number, r: number, colour: string) {
    const speed = Math.hypot(o.vx, o.vy) || 1;
    const tx = x - (o.vx / speed) * r * 1.6;
    const ty = y - (o.vy / speed) * r * 1.6;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawHud(ctx: CanvasRenderingContext2D, sim: Sim, threat: number) {
    const W = T.VIEW_W;
    const H = T.VIEW_H;

    // Vignettes: red for a threat at hand, storm-purple when outside the
    // ring. Both pulse, the storm's slower — the doc's heartbeat and rumble,
    // as light.
    let inStorm = false;
    if (!sim.dead) for (const c of sim.cells) if (Math.hypot(c.x, c.y) > sim.ring) inStorm = true;
    if (threat > 0 || inStorm) {
      const v = vignetteFor(ctx);
      const pulse = 0.75 + 0.25 * Math.sin(clock * (inStorm ? 6 : 9));
      ctx.globalAlpha = (inStorm ? 0.7 : threat * 0.65) * pulse;
      ctx.fillStyle = inStorm ? v.storm : v.threat;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Top-left: mass, score, lives.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(`${Math.floor(sim.dead ? 0 : sim.mass())}`, 18, 14);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("MASS", 18, 40);
    ctx.fillText(`RANK #${sim.rank}`, 80, 40);
    for (let i = 0; i < T.LIVES; i++) {
      ctx.beginPath();
      ctx.arc(24 + i * 16, 64, 5, 0, Math.PI * 2);
      ctx.fillStyle = i < sim.lives ? PLAYER : "rgba(255,255,255,0.18)";
      ctx.fill();
    }

    // Top-centre: the clock of the run.
    ctx.textAlign = "center";
    if (sim.phase === "normal") {
      const left = Math.max(0, T.NORMAL_S - sim.t);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillText(`BIG MODE IN ${Math.ceil(left)}s`, W / 2, 14);
    } else if (sim.phase === "big") {
      const t = sim.bigT - T.BIG_INTRO_S;
      const left = t < 0 ? T.BIG_S : Math.max(0, T.BIG_S - t);
      ctx.fillStyle = STORM_EDGE;
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.fillText(left > 0 ? `STORM CLOSES IN ${Math.ceil(left)}s` : "HOLD THE EYE", W / 2, 14);
      // Progress of the ring, as a thin bar.
      const f = Math.min(1, Math.max(0, t / T.BIG_S));
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(W / 2 - 120, 32, 240, 4);
      ctx.fillStyle = STORM_EDGE;
      ctx.fillRect(W / 2 - 120, 32, 240 * f, 4);
    }

    // Top-right: the board.
    const bx = W - 18;
    ctx.textAlign = "right";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("LEADERS", bx, 14);
    ctx.font = "600 13px system-ui, sans-serif";
    for (let i = 0; i < sim.board.length; i++) {
      const row = sim.board[i];
      ctx.fillStyle = row.you ? PLAYER : "rgba(255,255,255,0.85)";
      ctx.fillText(`${i + 1}. ${row.name}  ${Math.floor(row.mass)}`, bx, 30 + i * 17);
    }

    // Bottom-left: the feed.
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = "600 13px system-ui, sans-serif";
    for (let i = 0; i < sim.feed.length; i++) {
      const line = sim.feed[i];
      ctx.globalAlpha = Math.min(1, line.ttl / 0.6);
      ctx.fillStyle = line.kill ? PREY : "rgba(255,255,255,0.75)";
      ctx.fillText(line.text, 18, H - 18 - i * 18);
    }
    ctx.globalAlpha = 1;

    // Bottom-right: the split button.
    const size = T.SPLIT_BTN.size;
    const sx = W - T.SPLIT_BTN.margin - size;
    const sy = H - T.SPLIT_BTN.margin - size;
    const can = !sim.dead && sim.cells.length === 1 && sim.splitCd <= 0 && sim.mass() >= T.SPLIT_MIN_MASS;
    ctx.beginPath();
    ctx.arc(sx + size / 2, sy + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = can ? "rgba(111,245,255,0.18)" : "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = can ? PLAYER : "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Two small orbs, the icon.
    ctx.fillStyle = can ? PLAYER : "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(sx + size / 2 - 9, sy + size / 2, 8, 0, Math.PI * 2);
    ctx.arc(sx + size / 2 + 11, sy + size / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("SPLIT", sx + size / 2, sy + size + 4);

    // Big Mode announcement.
    if (sim.phase === "big" && sim.bigT < T.BIG_INTRO_S) {
      const a = sim.bigT < 0.4 ? sim.bigT / 0.4 : sim.bigT > T.BIG_INTRO_S - 1 ? T.BIG_INTRO_S - sim.bigT : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = "rgba(20, 4, 24, 0.55)";
      ctx.fillRect(0, H / 2 - 62, W, 124);
      ctx.fillStyle = STORM_EDGE;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 52px system-ui, sans-serif";
      ctx.fillText("BIG MODE", W / 2, H / 2 - 12);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillText("The world has grown. The storm is closing. Stay inside the ring.", W / 2, H / 2 + 30);
      ctx.globalAlpha = 1;
    }

    // Death.
    if (sim.dead && sim.phase !== "done") {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = THREAT;
      ctx.font = "bold 36px system-ui, sans-serif";
      ctx.fillText(`Eaten by ${sim.eatenBy}`, W / 2, H / 2 - 14);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "600 14px system-ui, sans-serif";
      const lives = sim.lives === 1 ? "last life" : `${sim.lives} lives left`;
      ctx.fillText(sim.deathSteps > 0 ? lives : `${lives} · back in ${Math.max(0, sim.respawnIn).toFixed(1)}s`, W / 2, H / 2 + 22);
    }

    // The flash.
    if (flashAmt > 0) {
      ctx.globalAlpha = flashAmt * 0.6;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  return {
    draw(ctx, sim, alpha, shake, threat, canvasW, canvasH) {
      const view = fitView(canvasW, canvasH, T.VIEW_W, T.VIEW_H);
      enterView(ctx, view, canvasW, canvasH, "#05070f");
      // The view's own clip, so the world never paints into the letterbox.
      ctx.beginPath();
      ctx.rect(0, 0, T.VIEW_W, T.VIEW_H);
      ctx.clip();
      if (shake > 0) ctx.translate((rng() - 0.5) * 2 * shake, (rng() - 0.5) * 2 * shake);

      const zoom = lerp(sim.zoomP, sim.zoom, alpha);
      const camX = lerp(sim.camPX, sim.camX, alpha);
      const camY = lerp(sim.camPY, sim.camY, alpha);

      ctx.save();
      ctx.translate(T.VIEW_W / 2, T.VIEW_H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);
      drawWorld(ctx, sim, alpha, zoom, camX, camY);
      ctx.restore();

      drawHud(ctx, sim, threat);
      ctx.restore();
    },
    burst,
    flash(strength) {
      flashAmt = Math.max(flashAmt, strength);
    },
    step(dt) {
      clock += dt;
      if (flashAmt > 0) flashAmt = Math.max(0, flashAmt - dt * 3);
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    },
    destroy() {
      for (const p of pool) p.life = 0;
    },
  };
}
