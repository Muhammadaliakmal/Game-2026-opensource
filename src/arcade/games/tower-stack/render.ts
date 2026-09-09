import * as T from "./tuning";
import type { Sim } from "./sim";

/**
 * Tower Stack's drawing.
 *
 * ── The hue cycle is the art budget ──────────────────────────────────────
 *
 * One HSL step per row, and the tower looks designed for the cost of an
 * arithmetic expression. It also does something a flat palette cannot: it
 * tells you how high you are at a glance, because the colour at the top is
 * only reachable by having stacked that many rows.
 *
 * ── Everything is a rectangle ────────────────────────────────────────────
 *
 * No shadows, no gradients per row, no `shadowBlur`. A blurred shadow is the
 * single most expensive thing canvas 2D offers and it would be paid twenty-six
 * times a frame here for an effect nobody would name if it vanished.
 */

const rowColour = (index: number) =>
  `hsl(${(T.HUE_START + index * T.HUE_STEP) % 360} 70% 58%)`;

export interface Renderer {
  draw(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    alpha: number,
    canvasW: number,
    canvasH: number,
    flash: number,
    comboAge: number
  ): void;
  destroy(): void;
}

export function createRenderer(): Renderer {
  const w = T.VIEW_W;
  const h = T.VIEW_H;

  return {
    draw(ctx, sim, alpha, canvasW, canvasH, flash, comboAge) {
      const k = Math.min(canvasW / w, canvasH / h);

      ctx.save();
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.translate(
        Math.round((canvasW - w * k) / 2),
        Math.round((canvasH - h * k) / 2)
      );
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();

      ctx.fillStyle = "#0b1030";
      ctx.fillRect(0, 0, w, h);

      // ── The ground ──
      // The base has to be standing on something. Without it the first block
      // hangs in the middle of an empty field and the game reads as unfinished
      // before the player has pressed anything.
      ctx.fillStyle = "#141a3d";
      ctx.fillRect(0, T.FLOOR_Y, w, h - T.FLOOR_Y);
      ctx.fillStyle = "#2b3570";
      ctx.fillRect(0, T.FLOOR_Y, w, 2);

      // ── The tower ──
      // Every y comes from `sim.rowY`, which is the one place the world-to-
      // screen transform is written. The tower is anchored to the floor and
      // grows UP; the camera only starts climbing once the top would pass the
      // drop line. Drawing it downward from a pinned top — which is what this
      // did — is the same tower and the opposite mechanic.
      for (let i = 0; i < T.VISIBLE_ROWS; i++) {
        const row = sim.rowAt(i);
        if (!row) break;
        const y = sim.rowY(sim.placed - 1 - i);
        // Off the bottom: everything below is further off it still.
        if (y > h) break;
        ctx.fillStyle = rowColour(sim.placed - 1 - i);
        ctx.fillRect(Math.round(row.x), Math.round(y), Math.round(row.w), T.ROW_H - 2);
      }

      // ── The block in play ──
      // One row above the top of the tower, wherever that currently is.
      const activeY = sim.rowY(sim.placed);
      const landY = sim.rowY(sim.placed - 1);
      if (!sim.dead) {
        const x = sim.prevX + (sim.curX - sim.prevX) * alpha;
        ctx.fillStyle = rowColour(sim.placed);
        ctx.fillRect(
          Math.round(x),
          Math.round(activeY),
          Math.round(sim.curW),
          T.ROW_H - 2
        );
        // A one-pixel guide from the block's left edge across the row it is
        // about to land on. In a timing game the only information that matters
        // is where the two edges line up, and this is what makes that readable
        // at 520 px/s. Anchored to the landing row rather than to a fixed
        // screen height, so it can never end up hanging in empty space below
        // the tower — which is what it did before there was a floor.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(Math.round(x), Math.round(landY), 1, T.ROW_H);
        ctx.globalAlpha = 1;
      }

      // ── Sliced pieces ──
      ctx.fillStyle = "#64748b";
      for (let i = 0; i < sim.slices.length; i++) {
        const sl = sim.slices[i];
        if (sl.life <= 0) continue;
        ctx.globalAlpha = Math.min(1, sl.life);
        ctx.fillRect(Math.round(sl.x), Math.round(sl.y), Math.round(sl.w), T.ROW_H - 2);
      }
      ctx.globalAlpha = 1;

      // ── Combo ──
      if (sim.combo > 1 && comboAge < T.COMBO_TIME) {
        const age = comboAge / T.COMBO_TIME;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.translate(w / 2, activeY - 42);
        // Scales up as it fades, which is the cheapest way to make a number
        // feel like an event rather than a readout.
        ctx.scale(1 + age * 0.6, 1 + age * 0.6);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 34px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${sim.combo}x`, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
      }

      // ── Perfect flash ──
      // Over everything, and brief. A white frame is what makes a perfect feel
      // like it landed rather than merely counted.
      if (flash > 0) {
        ctx.globalAlpha = Math.min(0.5, flash / T.FLASH_TIME) * 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    },

    destroy() {
      // Nothing retained: this renderer holds no canvases, images or nodes.
    },
  };
}
