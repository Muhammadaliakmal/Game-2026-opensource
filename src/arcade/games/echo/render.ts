import * as T from "./tuning";
import { LEVELS, type EchoLevel } from "./levels";
import type { Sim } from "./sim";
import { bevelRect, grainOverlay, plateOverlay } from "@/arcade/host/texture";
import { enterView, fitView } from "@/arcade/host/view";
import { gameFont } from "@/arcade/host/type";

/**
 * ECHO's drawing, and nothing else.
 *
 * A dark room seen from above, drawn in three layers: the floor and walls,
 * which are the same every frame of a level and are painted once into an
 * offscreen canvas; the things that change — doors, plates, guards; and the
 * runner with its ghosts on top. The ghosts are the runner at a quarter
 * opacity with their loop number on them, because the whole game is knowing
 * which past self is about to do what.
 *
 * The HUD strip across the top is the clock as a bar. A number counting
 * down is read; a bar shrinking is *felt*, and the last second of a run is
 * the moment the player most needs to feel it without looking away.
 */

const PLATE = plateOverlay(9);
const GRAIN = grainOverlay(31, 0.1);

const INK = "#0b0f1e";
const FLOOR = "#141a30";
const WALL = "#2a3358";
const WALL_LIT = "#3d4a7a";
const ACCENT = "#5ce1ff";
const PLATE_OFF = "#2b4a5a";
const PLATE_ON = "#5ce1ff";
const DOOR = "#ff6a3d";
const GUARD = "#ff3d6a";
const EXIT = "#7dffb0";
const RUNNER = "#ffffff";

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, sim: Sim, alpha: number, shake: number, w: number, h: number): void;
  destroy(): void;
}

export function createRenderer(rng: () => number): Renderer {
  let floorFor = -1;
  let floor: HTMLCanvasElement | null = null;

  /** The floor and the walls of a level, painted once. */
  function paintFloor(index: number, level: EchoLevel) {
    if (typeof document === "undefined") return;
    const c = floor ?? document.createElement("canvas");
    c.width = T.ROOM_W;
    c.height = T.ROOM_H;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = FLOOR;
    g.fillRect(0, 0, T.ROOM_W, T.ROOM_H);
    // A faint grid, so movement reads against something.
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.lineWidth = 1;
    for (let x = 0; x <= T.ROOM_W; x += 40) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, T.ROOM_H);
      g.stroke();
    }
    for (let y = 0; y <= T.ROOM_H; y += 40) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(T.ROOM_W, y + 0.5);
      g.stroke();
    }
    for (const w of level.walls) {
      bevelRect(g, w.x, w.y, w.w, w.h, WALL, 3);
      g.save();
      g.translate(w.x, w.y);
      g.fillStyle = PLATE.fill(g, 24);
      g.fillRect(0, 0, w.w, w.h);
      g.fillStyle = GRAIN.fill(g, 32);
      g.fillRect(0, 0, w.w, w.h);
      g.restore();
      g.fillStyle = WALL_LIT;
      g.fillRect(w.x, w.y, w.w, 2);
    }
    floor = c;
    floorFor = index;
  }

  function runner(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, label: string | null) {
    const r = T.PLAYER_R;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = RUNNER;
    ctx.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
    // A visor, so the box has a front.
    ctx.fillStyle = ACCENT;
    ctx.fillRect(Math.round(x - r + 4), Math.round(y - r + 5), r * 2 - 8, 5);
    if (label) {
      ctx.fillStyle = INK;
      ctx.font = gameFont(13);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, Math.round(x), Math.round(y + 3));
    }
    ctx.globalAlpha = 1;
  }

  return {
    draw(ctx, sim, alpha, shake, canvasW, canvasH) {
      const level = LEVELS[Math.min(sim.level, LEVELS.length - 1)];
      if (floorFor !== sim.level) paintFloor(sim.level, level);

      const view = fitView(canvasW, canvasH, T.VIEW_W, T.VIEW_H);
      enterView(ctx, view, canvasW, canvasH, INK);

      if (shake > 0) {
        ctx.translate(Math.round((rng() * 2 - 1) * shake), Math.round((rng() * 2 - 1) * shake));
      }

      // ── HUD ──────────────────────────────────────────────────────────
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, T.VIEW_W, T.HUD_H);
      const frac = Math.max(0, sim.clock / level.time);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(16, 14, T.VIEW_W - 32, 12);
      ctx.fillStyle = frac < 0.25 ? DOOR : ACCENT;
      ctx.fillRect(16, 14, Math.round((T.VIEW_W - 32) * frac), 12);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = gameFont(13);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${sim.level + 1}/${LEVELS.length}  ${level.name.toUpperCase()}`, 16, 37);
      ctx.textAlign = "right";
      ctx.fillText(`LOOP ${sim.loop + 1} · ${Math.max(0, level.loops - sim.ghosts.length)} GHOST${level.loops - sim.ghosts.length === 1 ? "" : "S"} LEFT`, T.VIEW_W - 16, 37);

      // ── The room ─────────────────────────────────────────────────────
      ctx.translate(0, T.HUD_H);
      if (floor) ctx.drawImage(floor, 0, 0);
      else {
        ctx.fillStyle = FLOOR;
        ctx.fillRect(0, 0, T.ROOM_W, T.ROOM_H);
      }

      // Exit.
      const e = level.exit;
      ctx.fillStyle = "rgba(125,255,176,0.12)";
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = EXIT;
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      ctx.fillStyle = EXIT;
      ctx.font = gameFont(12);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXIT", e.x + e.w / 2, e.y + e.h / 2);

      // Plates.
      for (const p of level.plates) {
        const on = sim.held[p.id] === true;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = on ? "rgba(92,225,255,0.25)" : "rgba(43,74,90,0.5)";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = on ? PLATE_ON : PLATE_OFF;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = on ? PLATE_ON : PLATE_OFF;
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = gameFont(14);
        ctx.fillText(p.id.toUpperCase(), p.x, p.y + 1);
      }

      // Doors. Solid: a barred slab. Open: the outline, and the letter of
      // the plate that opened it, so the player can read the wiring.
      for (let i = 0; i < level.doors.length; i++) {
        const d = level.doors[i];
        const solid = sim.doorSolid[i];
        if (solid) {
          bevelRect(ctx, d.x, d.y, d.w, d.h, DOOR, 2);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          for (let y = d.y + 8; y < d.y + d.h - 4; y += 12) ctx.fillRect(d.x + 3, y, d.w - 6, 4);
        } else {
          ctx.strokeStyle = "rgba(255,106,61,0.45)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
          ctx.setLineDash([]);
        }
        ctx.fillStyle = solid ? INK : DOOR;
        ctx.font = gameFont(11);
        ctx.fillText((d.inverted ? "¬" : "") + d.plate.toUpperCase(), d.x + d.w / 2, d.y + d.h / 2);
      }

      // Guards.
      for (let i = 0; i < level.patrols.length; i++) {
        const p = level.patrols[i];
        const gx = sim.guards[i * 2];
        const gy = sim.guards[i * 2 + 1];
        ctx.beginPath();
        ctx.arc(gx, gy, p.r + 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,61,106,0.18)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, p.r, 0, Math.PI * 2);
        ctx.fillStyle = GUARD;
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.fillRect(gx - 6, gy - 2, 12, 4);
      }

      // Ghosts, then the runner.
      for (let i = 0; i < sim.ghosts.length; i++) {
        const g = sim.ghosts[i];
        if (sim.tick >= g.steps) continue;
        runner(ctx, g.path[sim.tick * 2], g.path[sim.tick * 2 + 1], 0.32, String(i + 1));
      }
      const rx = sim.prevX + (sim.px - sim.prevX) * alpha;
      const ry = sim.prevY + (sim.py - sim.prevY) * alpha;
      runner(ctx, rx, ry, 1, null);

      // ── Overlays ─────────────────────────────────────────────────────
      if (sim.phase !== "run") {
        ctx.fillStyle = "rgba(11,15,30,0.55)";
        ctx.fillRect(0, 0, T.ROOM_W, T.ROOM_H);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.font = gameFont(44);
        let title = "";
        let sub = "";
        if (sim.phase === "reset") {
          title = `LOOP ${sim.loop + 1}`;
          sub = `Ghost ${sim.ghosts.length} is on the floor. Use it.`;
        } else if (sim.phase === "clear") {
          title = "CLEAR";
          sub = sim.level + 1 < LEVELS.length ? `Next: ${LEVELS[sim.level + 1].name}` : "That was the last room.";
        } else if (sim.phase === "lost" || sim.phase === "done") {
          title = sim.outcome === "won" ? "ALL CLEAR" : "OUT OF LOOPS";
          sub = sim.outcome === "won" ? "Every room, cleared by you and yours." : "The exit was one loop further.";
        }
        ctx.fillText(title, T.ROOM_W / 2, T.ROOM_H / 2 - 14);
        ctx.font = gameFont(16);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(sub, T.ROOM_W / 2, T.ROOM_H / 2 + 26);
      } else if (sim.tick < 150 && sim.ghosts.length === 0) {
        // The hint, on the first run of a level only, and only briefly.
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = gameFont(15);
        ctx.fillText(level.hint, T.ROOM_W / 2, T.ROOM_H - 26);
      }

      ctx.restore();
    },
    destroy() {
      floor = null;
    },
  };
}
