import * as T from "./tuning";
import { LEVELS } from "./levels";
import { DIRS, Tile, tileAt, type Sim } from "./sim";
import { bevelRect, grainOverlay } from "@/arcade/host/texture";
import { enterView, fitView } from "@/arcade/host/view";

/**
 * Gravity Shift's drawing.
 *
 * The room is tiles, and the tiles that never change — walls, spikes, light
 * zones — are painted once per level into an offscreen canvas. Glass and
 * coins can vanish, so they are drawn live from the tile grid. The ball is
 * a circle with a highlight that always sits on the side away from gravity,
 * which is the one visual cue that says which way is down without an arrow.
 *
 * The HUD is the level name, the flips against par, and lives — and a
 * compass: four chevrons around the edge of the room, the live one lit.
 * On a phone that is also the instruction: tap a chevron's side.
 */

const GRAIN = grainOverlay(41, 0.1);

const INK = "#0a0e1c";
const FLOOR = "#12182b";
const WALL = "#2b355c";
const WALL_LIT = "#46538a";
const SPIKE = "#ff4d6d";
const GOAL = "#7dffb0";
const COIN = "#ffd166";
const GLASS = "rgba(160,220,255,0.55)";
const GLASS_EDGE = "rgba(220,245,255,0.9)";
const LIGHT = "rgba(140,170,255,0.10)";
const BALL = "#ffffff";
const ACCENT = "#5ce1ff";

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, sim: Sim, alpha: number, shake: number, w: number, h: number): void;
  /** A landing puff at the ball. */
  puff(x: number, y: number, gx: number, gy: number): void;
  step(dt: number): void;
  destroy(): void;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const MOTES = 20;

export function createRenderer(rng: () => number): Renderer {
  let floorFor = -1;
  let floor: HTMLCanvasElement | null = null;
  const motes: Mote[] = [];
  for (let i = 0; i < MOTES; i++) motes.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  let moteNext = 0;

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
        } else if (t === Tile.Light) {
          g.fillStyle = LIGHT;
          g.fillRect(x, y, T.TILE, T.TILE);
        } else if (t === Tile.Spike) {
          // Teeth pointing away from the nearest wall, or up if none.
          g.fillStyle = SPIKE;
          const up = tileAt(tiles, cc, r + 1) === Tile.Wall;
          const down = tileAt(tiles, cc, r - 1) === Tile.Wall;
          const left = tileAt(tiles, cc + 1, r) === Tile.Wall;
          const dir = up ? 0 : down ? 2 : left ? 3 : 1;
          for (let i = 0; i < 3; i++) {
            const a = i * (T.TILE / 3);
            g.beginPath();
            if (dir === 0) {
              g.moveTo(x + a, y + T.TILE);
              g.lineTo(x + a + T.TILE / 6, y + 6);
              g.lineTo(x + a + T.TILE / 3, y + T.TILE);
            } else if (dir === 2) {
              g.moveTo(x + a, y);
              g.lineTo(x + a + T.TILE / 6, y + T.TILE - 6);
              g.lineTo(x + a + T.TILE / 3, y);
            } else if (dir === 3) {
              g.moveTo(x + T.TILE, y + a);
              g.lineTo(x + 6, y + a + T.TILE / 6);
              g.lineTo(x + T.TILE, y + a + T.TILE / 3);
            } else {
              g.moveTo(x, y + a);
              g.lineTo(x + T.TILE - 6, y + a + T.TILE / 6);
              g.lineTo(x, y + a + T.TILE / 3);
            }
            g.closePath();
            g.fill();
          }
        } else if (t === Tile.Goal) {
          g.fillStyle = "rgba(125,255,176,0.14)";
          g.fillRect(x, y, T.TILE, T.TILE);
          g.strokeStyle = GOAL;
          g.lineWidth = 2;
          g.strokeRect(x + 3, y + 3, T.TILE - 6, T.TILE - 6);
          g.strokeRect(x + 10, y + 10, T.TILE - 20, T.TILE - 20);
        }
      }
    }
    floor = c;
    floorFor = index;
  }

  return {
    puff(x, y, gx, gy) {
      for (let i = 0; i < 6; i++) {
        const m = motes[moteNext];
        moteNext = (moteNext + 1) % MOTES;
        m.x = x + gx * T.BALL_R;
        m.y = y + gy * T.BALL_R;
        // Spray across the surface, and a little away from it.
        const along = (rng() * 2 - 1) * 160;
        const away = 40 + rng() * 60;
        m.vx = gy !== 0 ? along : -gx * away;
        m.vy = gx !== 0 ? along : -gy * away;
        m.life = 0.3 + rng() * 0.2;
      }
    },
    step(dt) {
      for (const m of motes) {
        if (m.life <= 0) continue;
        m.life -= dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= 0.9;
        m.vy *= 0.9;
      }
    },
    draw(ctx, sim, alpha, shake, canvasW, canvasH) {
      const level = LEVELS[Math.min(sim.level, LEVELS.length - 1)];
      if (floorFor !== sim.level) paintFloor(sim.level, sim.tiles);

      const view = fitView(canvasW, canvasH, T.VIEW_W, T.VIEW_H);
      enterView(ctx, view, canvasW, canvasH, INK);
      if (shake > 0) ctx.translate(Math.round((rng() * 2 - 1) * shake), Math.round((rng() * 2 - 1) * shake));

      // ── HUD ──────────────────────────────────────────────────────────
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, T.VIEW_W, T.HUD_H);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${sim.level + 1}/${LEVELS.length}  ${level.name.toUpperCase()}`, 16, 22);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(level.hint, 16, 44);
      ctx.textAlign = "right";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.fillStyle = sim.flips > level.par ? SPIKE : "rgba(255,255,255,0.8)";
      ctx.fillText(`FLIPS ${sim.flips} · PAR ${level.par}`, T.VIEW_W - 16, 22);
      // Lives as balls.
      for (let i = 0; i < T.LIVES; i++) {
        ctx.beginPath();
        ctx.arc(T.VIEW_W - 22 - i * 18, 44, 5, 0, Math.PI * 2);
        ctx.fillStyle = i < sim.lives ? BALL : "rgba(255,255,255,0.15)";
        ctx.fill();
      }

      // ── The room ─────────────────────────────────────────────────────
      ctx.translate(0, T.HUD_H);
      if (floor) ctx.drawImage(floor, 0, 0);
      else {
        ctx.fillStyle = FLOOR;
        ctx.fillRect(0, 0, T.COLS * T.TILE, T.ROWS * T.TILE);
      }

      // Live tiles.
      for (let r = 0; r < T.ROWS; r++) {
        for (let c = 0; c < T.COLS; c++) {
          const t = tileAt(sim.tiles, c, r);
          const x = c * T.TILE;
          const y = r * T.TILE;
          if (t === Tile.Glass) {
            ctx.fillStyle = GLASS;
            ctx.fillRect(x + 2, y + 2, T.TILE - 4, T.TILE - 4);
            ctx.strokeStyle = GLASS_EDGE;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 2.5, y + 2.5, T.TILE - 5, T.TILE - 5);
            ctx.beginPath();
            ctx.moveTo(x + 8, y + T.TILE - 8);
            ctx.lineTo(x + T.TILE - 8, y + 8);
            ctx.stroke();
          } else if (t === Tile.Coin) {
            ctx.beginPath();
            ctx.arc(x + T.TILE / 2, y + T.TILE / 2, 8, 0, Math.PI * 2);
            ctx.fillStyle = COIN;
            ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(x + T.TILE / 2 - 2, y + T.TILE / 2 - 5, 4, 10);
          }
        }
      }

      // The compass: a chevron on each edge, the live one lit.
      const [gx, gy] = DIRS[sim.gravity];
      const W = T.COLS * T.TILE;
      const H = T.ROWS * T.TILE;
      const chev = (x: number, y: number, dx: number, dy: number, lit: boolean) => {
        ctx.strokeStyle = lit ? ACCENT : "rgba(255,255,255,0.18)";
        ctx.lineWidth = lit ? 4 : 2;
        ctx.beginPath();
        const px = -dy;
        const py = dx;
        ctx.moveTo(x - dx * 10 + px * 12, y - dy * 10 + py * 12);
        ctx.lineTo(x + dx * 4, y + dy * 4);
        ctx.lineTo(x - dx * 10 - px * 12, y - dy * 10 - py * 12);
        ctx.stroke();
      };
      chev(W / 2, H - 14, 0, 1, gy > 0);
      chev(W / 2, 14, 0, -1, gy < 0);
      chev(14, H / 2, -1, 0, gx < 0);
      chev(W - 14, H / 2, 1, 0, gx > 0);

      // Motes.
      for (const m of motes) {
        if (m.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, m.life * 3);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(Math.round(m.x) - 2, Math.round(m.y) - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      // The ball.
      const bx = sim.prevX + (sim.px - sim.prevX) * alpha;
      const by = sim.prevY + (sim.py - sim.prevY) * alpha;
      if (sim.phase !== "dead") {
        ctx.beginPath();
        ctx.arc(bx, by, T.BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = BALL;
        ctx.fill();
        // Highlight on the side away from down.
        ctx.beginPath();
        ctx.arc(bx - gx * 5, by - gy * 5, T.BALL_R * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
        // A shadow on the down side.
        ctx.beginPath();
        ctx.arc(bx + gx * 6, by + gy * 6, T.BALL_R * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fill();
      }

      // ── Overlays ─────────────────────────────────────────────────────
      if (sim.phase === "dead" || sim.phase === "clear" || sim.phase === "done") {
        ctx.fillStyle = "rgba(10,14,28,0.5)";
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 44px system-ui, sans-serif";
        let title = "";
        let sub = "";
        if (sim.phase === "dead") {
          title = sim.lives > 0 ? "OUCH" : "OUT OF BALLS";
          sub = sim.lives > 0 ? `${sim.lives} left` : "";
        } else if (sim.phase === "clear") {
          title = sim.flips <= level.par ? "PAR" : "CLEAR";
          sub = sim.level + 1 < LEVELS.length ? `Next: ${LEVELS[sim.level + 1].name}` : "That was the last room.";
        } else {
          title = sim.outcome === "won" ? "ALL CLEAR" : "OUT OF BALLS";
        }
        ctx.fillText(title, W / 2, H / 2 - 14);
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(sub, W / 2, H / 2 + 26);
      }

      ctx.restore();
    },
    destroy() {
      floor = null;
    },
  };
}
