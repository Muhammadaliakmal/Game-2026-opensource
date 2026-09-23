import * as T from "./tuning";
import { LEVELS } from "./levels";
import { Tile, tileAt, type BulletSim } from "./sim";
import { bevelRect, grainOverlay } from "@/arcade/host/texture";
import { enterView, fitView } from "@/arcade/host/view";
import { gameFont } from "@/arcade/host/type";

/**
 * One Bullet's drawing.
 *
 * Walls and mirrors are the room's bones and never change, so they are
 * painted once per level into an offscreen canvas. Everything the shot can
 * alter — glass, doors, crates, charges, targets — is drawn live from the
 * tile grid, and a switch is drawn live too because its doors are.
 *
 * ── The aiming line is the game ──────────────────────────────────────────
 *
 * While aiming, the line ahead of the turret is the sim's own `preview`: the
 * march run against a copy of the room for two bounces. It is drawn as a
 * dashed line that fades along its length, so the first bounce is certain
 * and the second is a suggestion — enough to read the room, not enough to
 * solve it from the turret. The dash offset scrolls with time so the line
 * reads as "where it will go" rather than as a wall.
 */

const GRAIN = grainOverlay(37, 0.1);

const INK = "#0d0a14";
const FLOOR = "#1a1424";
const WALL = "#3a2e4e";
const WALL_LIT = "#5a4a78";
const MIRROR = "#c8f0ff";
const GLASS = "rgba(160,220,255,0.45)";
const GLASS_EDGE = "rgba(220,245,255,0.9)";
const SWITCH = "#ffd166";
const DOOR = "#ff6a3d";
const CRATE = "#b8894a";
const CRATE_LIT = "#e0b070";
const CHARGE = "#ff3d6a";
const TARGET = "#7dffb0";
const SHOT = "#ffffff";
const ACCENT = "#ffd166";

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, sim: BulletSim, alpha: number, shake: number, w: number, h: number): void;
  step(dt: number): void;
  /** A burst at a point: a target going down, a charge going off. */
  burst(x: number, y: number, colour: string, count: number): void;
  destroy(): void;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  colour: string;
}

const SPARKS = 48;

export function createRenderer(rng: () => number): Renderer {
  let floorFor = -1;
  let floor: HTMLCanvasElement | null = null;
  const sparks: Spark[] = [];
  for (let i = 0; i < SPARKS; i++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, colour: SHOT });
  let sparkNext = 0;
  let clock = 0;
  const previewPts = new Float32Array(64);

  function paintFloor(index: number, tiles: Uint8Array) {
    if (typeof document === "undefined") return;
    const c = floor ?? document.createElement("canvas");
    c.width = T.COLS * T.TILE;
    c.height = T.ROWS * T.TILE;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = FLOOR;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(255,255,255,0.03)";
    g.lineWidth = 1;
    for (let x = 0; x <= c.width; x += T.TILE) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, c.height);
      g.stroke();
    }
    for (let y = 0; y <= c.height; y += T.TILE) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(c.width, y + 0.5);
      g.stroke();
    }
    for (let r = 0; r < T.ROWS; r++) {
      for (let cc = 0; cc < T.COLS; cc++) {
        const t = tileAt(tiles, cc, r);
        const x = cc * T.TILE;
        const y = r * T.TILE;
        if (t === Tile.Wall) {
          bevelRect(g, x, y, T.TILE, T.TILE, WALL, 3);
          g.save();
          g.translate(x, y);
          g.fillStyle = GRAIN.fill(g, 40);
          g.fillRect(0, 0, T.TILE, T.TILE);
          g.restore();
          if (tileAt(tiles, cc, r - 1) !== Tile.Wall) {
            g.fillStyle = WALL_LIT;
            g.fillRect(x, y, T.TILE, 2);
          }
        } else if (t === Tile.MirrorA || t === Tile.MirrorB) {
          // A bar corner to corner, with a faint pane behind it so the tile
          // reads as a thing and not as a stray line.
          g.fillStyle = "rgba(200,240,255,0.08)";
          g.fillRect(x, y, T.TILE, T.TILE);
          g.strokeStyle = MIRROR;
          g.lineWidth = 4;
          g.lineCap = "round";
          g.beginPath();
          if (t === Tile.MirrorA) {
            g.moveTo(x + 6, y + T.TILE - 6);
            g.lineTo(x + T.TILE - 6, y + 6);
          } else {
            g.moveTo(x + 6, y + 6);
            g.lineTo(x + T.TILE - 6, y + T.TILE - 6);
          }
          g.stroke();
        }
      }
    }
    floor = c;
    floorFor = index;
  }

  function drawLive(ctx: CanvasRenderingContext2D, tiles: Uint8Array) {
    for (let r = 0; r < T.ROWS; r++) {
      for (let c = 0; c < T.COLS; c++) {
        const t = tileAt(tiles, c, r);
        const x = c * T.TILE;
        const y = r * T.TILE;
        switch (t) {
          case Tile.Glass:
            ctx.fillStyle = GLASS;
            ctx.fillRect(x + 2, y + 2, T.TILE - 4, T.TILE - 4);
            ctx.strokeStyle = GLASS_EDGE;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 3, y + 3, T.TILE - 6, T.TILE - 6);
            ctx.beginPath();
            ctx.moveTo(x + 8, y + T.TILE - 8);
            ctx.lineTo(x + T.TILE - 8, y + 8);
            ctx.stroke();
            break;
          case Tile.Switch:
            bevelRect(ctx, x, y, T.TILE, T.TILE, "#4a3d1e", 2);
            ctx.beginPath();
            ctx.arc(x + T.TILE / 2, y + T.TILE / 2, 10, 0, Math.PI * 2);
            ctx.fillStyle = SWITCH;
            ctx.fill();
            ctx.fillStyle = INK;
            ctx.fillRect(x + T.TILE / 2 - 2, y + T.TILE / 2 - 6, 4, 12);
            break;
          case Tile.DoorShut:
            bevelRect(ctx, x, y, T.TILE, T.TILE, DOOR, 2);
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            for (let yy = y + 8; yy < y + T.TILE - 4; yy += 12) ctx.fillRect(x + 4, yy, T.TILE - 8, 4);
            break;
          case Tile.DoorOpen:
            ctx.strokeStyle = "rgba(255,106,61,0.45)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x + 3, y + 3, T.TILE - 6, T.TILE - 6);
            ctx.setLineDash([]);
            break;
          case Tile.Crate:
            bevelRect(ctx, x + 2, y + 2, T.TILE - 4, T.TILE - 4, CRATE, 3);
            ctx.strokeStyle = CRATE_LIT;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 6, y + 6);
            ctx.lineTo(x + T.TILE - 6, y + T.TILE - 6);
            ctx.moveTo(x + T.TILE - 6, y + 6);
            ctx.lineTo(x + 6, y + T.TILE - 6);
            ctx.stroke();
            break;
          case Tile.Charge: {
            const cx = x + T.TILE / 2;
            const cy = y + T.TILE / 2;
            const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
            ctx.beginPath();
            ctx.arc(cx, cy, 15 + pulse * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,61,106,${0.12 + pulse * 0.12})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, 11, 0, Math.PI * 2);
            ctx.fillStyle = CHARGE;
            ctx.fill();
            ctx.fillStyle = INK;
            ctx.font = gameFont(12);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", cx, cy + 1);
            break;
          }
          case Tile.Target: {
            const cx = x + T.TILE / 2;
            const cy = y + T.TILE / 2;
            ctx.strokeStyle = TARGET;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, 13, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fillStyle = TARGET;
            ctx.fill();
            break;
          }
        }
      }
    }
  }

  function turret(ctx: CanvasRenderingContext2D, sim: BulletSim) {
    ctx.beginPath();
    ctx.arc(sim.tx, sim.ty, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2238";
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();
    // The barrel.
    ctx.save();
    ctx.translate(sim.tx, sim.ty);
    ctx.rotate(sim.angle);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, -4, 22, 8);
    ctx.restore();
  }

  return {
    step(dt) {
      clock += dt;
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.9;
        s.vy *= 0.9;
      }
    },

    burst(x, y, colour, count) {
      for (let i = 0; i < count; i++) {
        const s = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % SPARKS;
        const a = rng() * Math.PI * 2;
        const v = 120 + rng() * 240;
        s.x = x;
        s.y = y;
        s.vx = Math.cos(a) * v;
        s.vy = Math.sin(a) * v;
        s.life = 0.25 + rng() * 0.3;
        s.colour = colour;
      }
    },

    draw(ctx, sim, alpha, shake, canvasW, canvasH) {
      const level = LEVELS[Math.min(sim.level, LEVELS.length - 1)];
      if (floorFor !== sim.level) paintFloor(sim.level, sim.tiles);

      const view = fitView(canvasW, canvasH, T.VIEW_W, T.VIEW_H);
      enterView(ctx, view, canvasW, canvasH, INK);

      if (shake > 0) {
        ctx.translate(Math.round((rng() * 2 - 1) * shake), Math.round((rng() * 2 - 1) * shake));
      }

      // ── HUD ──────────────────────────────────────────────────────────
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, T.VIEW_W, T.HUD_H);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = gameFont(13);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${sim.level + 1}/${LEVELS.length}  ${level.name.toUpperCase()}`, 16, 24);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = gameFont(12);
      ctx.fillText(level.hint, 16, 44);

      // Bounces: one pip per bounce in the budget, spent ones hollow.
      ctx.textAlign = "right";
      ctx.font = gameFont(13);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(`${sim.targetsLeft} LEFT`, T.VIEW_W - 16, 24);
      const budget = level.bounces;
      const used = sim.phase === "flight" ? sim.bounces : 0;
      for (let i = 0; i < budget; i++) {
        const x = T.VIEW_W - 16 - i * 14 - 5;
        ctx.beginPath();
        ctx.arc(x, 40, 4, 0, Math.PI * 2);
        if (i < budget - used) {
          ctx.fillStyle = ACCENT;
          ctx.fill();
        } else {
          ctx.strokeStyle = "rgba(255,209,102,0.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      if (budget === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = gameFont(11);
        ctx.fillText("NO BOUNCES", T.VIEW_W - 16, 44);
      }
      // Lives, at the centre.
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = gameFont(13);
      ctx.fillText("●".repeat(Math.max(0, sim.lives)) + "○".repeat(Math.max(0, T.LIVES - sim.lives)), T.VIEW_W / 2, 26);

      // ── The room ─────────────────────────────────────────────────────
      ctx.translate(0, T.HUD_H);
      if (floor) ctx.drawImage(floor, 0, 0);
      else {
        ctx.fillStyle = FLOOR;
        ctx.fillRect(0, 0, T.COLS * T.TILE, T.ROWS * T.TILE);
      }
      drawLive(ctx, sim.tiles);

      // The aim line, while aiming.
      if (sim.phase === "aim") {
        const n = sim.preview(sim.angle, previewPts);
        if (n >= 2) {
          ctx.save();
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.setLineDash([8, 8]);
          ctx.lineDashOffset = -((clock * 90) % 16);
          for (let i = 1; i < n; i++) {
            // Fades with each segment: the first bounce is a promise, the
            // second a hint.
            ctx.strokeStyle = `rgba(255,209,102,${Math.max(0.15, 0.85 - i * 0.28)})`;
            ctx.beginPath();
            ctx.moveTo(previewPts[(i - 1) * 2], previewPts[(i - 1) * 2 + 1]);
            ctx.lineTo(previewPts[i * 2], previewPts[i * 2 + 1]);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      turret(ctx, sim);

      // The trail, then the shot.
      if (sim.phase === "flight" || sim.phase === "clear" || sim.phase === "spent") {
        for (let i = 0; i < T.TRAIL; i++) {
          const k = (sim.trailAt - 1 - i + T.TRAIL * 2) % T.TRAIL;
          const x = sim.trail[k * 2];
          const y = sim.trail[k * 2 + 1];
          if (x < -100) continue;
          const f = 1 - i / T.TRAIL;
          ctx.beginPath();
          ctx.arc(x, y, 1.5 + f * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${f * 0.45})`;
          ctx.fill();
        }
        if (sim.phase === "flight") {
          const bx = sim.prevX + (sim.bx - sim.prevX) * alpha;
          const by = sim.prevY + (sim.by - sim.prevY) * alpha;
          ctx.beginPath();
          ctx.arc(bx, by, 9, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx, by, 5, 0, Math.PI * 2);
          ctx.fillStyle = SHOT;
          ctx.fill();
        }
      }

      for (const s of sparks) {
        if (s.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, s.life * 3);
        ctx.fillStyle = s.colour;
        ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      // ── Overlays ─────────────────────────────────────────────────────
      const roomW = T.COLS * T.TILE;
      const roomH = T.ROWS * T.TILE;
      if (sim.phase === "spent" || sim.phase === "clear" || sim.phase === "done") {
        ctx.fillStyle = "rgba(13,10,20,0.55)";
        ctx.fillRect(0, 0, roomW, roomH);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.font = gameFont(44);
        let title = "";
        let sub = "";
        if (sim.phase === "spent") {
          title = "SPENT";
          sub = sim.lives > 0 ? `${sim.lives} shot${sim.lives === 1 ? "" : "s"} left. Same room.` : "That was the last one.";
        } else if (sim.phase === "clear") {
          title = "CLEAR";
          sub = sim.level + 1 < LEVELS.length ? `Next: ${LEVELS[sim.level + 1].name}` : "That was the last room.";
        } else {
          title = sim.outcome === "won" ? "EVERY ROOM" : "OUT OF SHOTS";
          sub = sim.outcome === "won" ? "One bullet, all of it." : "The shot was there. The angle was not.";
        }
        ctx.fillText(title, roomW / 2, roomH / 2 - 14);
        ctx.font = gameFont(16);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(sub, roomW / 2, roomH / 2 + 26);
      }

      ctx.restore();
    },

    destroy() {
      floor = null;
    },
  };
}
