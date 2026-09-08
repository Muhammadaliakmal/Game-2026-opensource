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

      const dropY = h * T.DROP_LINE;

      // ── The tower ──
      // Row 0 is the one just placed and sits at the drop line; each older row
      // is one row-height below it. The camera is already folded into that
      // relationship, so nothing here has to know how tall the tower is.
      for (let i = 0; i < T.VISIBLE_ROWS; i++) {
        const row = sim.rowAt(i);
        if (!row) break;
        const y = dropY + i * T.ROW_H;
        if (y > h) break;
        ctx.fillStyle = rowColour(sim.placed - 1 - i);
        ctx.fillRect(Math.round(row.x), Math.round(y), Math.round(row.w), T.ROW_H - 2);
      }

      // ── The block in play ──
      if (!sim.dead) {
        const x = sim.prevX + (sim.curX - sim.prevX) * alpha;
        ctx.fillStyle = rowColour(sim.placed);
        ctx.fillRect(
          Math.round(x),
          Math.round(dropY - T.ROW_H),
          Math.round(sim.curW),
          T.ROW_H - 2
        );
        // A one-pixel guide down from the block's left edge. In a timing game
        // the only information that matters is where the edges line up, and
        // this is what makes that readable at 520 px/s.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(Math.round(x), Math.round(dropY), 1, T.ROW_H);
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
        ctx.translate(w / 2, dropY - 70);
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
