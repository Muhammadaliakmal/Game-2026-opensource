import * as T from "./tuning";
import type { Sim, Target } from "./sim";
import { enterView, fitView } from "@/arcade/host/view";
import { grainOverlay } from "@/arcade/host/texture";

/**
 * Reflex's drawing.
 *
 * ── The ring is the entire interface ─────────────────────────────────────
 *
 * A target is a disc with a ring closing around it, and the ring's angle is
 * exactly `1 - age / life`. That is not decoration: the window is the game,
 * and a game whose single difficulty variable is invisible is a game that
 * feels arbitrary. With the ring, a player can see that the later targets are
 * harder rather than merely losing more often, which is the difference
 * between a curve and a wall.
 *
 * It also gives the eye something to track that is not the disc. The disc
 * tells you where; the ring tells you how long — and because the ring is on
 * the outside it is readable from peripheral vision, where the next target
 * usually appears.
 *
 * ── Colour carries the urgency, and only near the end ────────────────────
 *
 * The ring runs accent-cyan for most of its life and shifts to warning-amber
 * inside the last third. Not a continuous gradient: a colour that is always
 * changing is a colour nobody reads, while one that changes once is an alarm.
 *
 * ── No shadows, no blur ──────────────────────────────────────────────────
 *
 * The same rule Tower Stack's renderer states. `shadowBlur` is the most
 * expensive thing canvas 2D offers, and a reaction game is the last place to
 * spend frame time on something nobody would name if it vanished. Everything
 * here is arcs, rects and one grain overlay painted once at load.
 */

/** One grain tile, made once. The only texture in the game. */
const GRAIN = grainOverlay(5, 0.1);

const BACKDROP = "#05070f";
const FIELD = "#0b1030";
const ACCENT = "#22d3ee";
const URGENT = "#f59e0b";
const INK = "#eef1ff";

/** Below this fraction of life remaining, the ring turns amber. */
const URGENT_AT = 1 / 3;

export interface Renderer {
  draw(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    canvasW: number,
    canvasH: number,
    burst: number,
    shake: number,
    rng: () => number
  ): void;
  destroy(): void;
}

function drawTarget(ctx: CanvasRenderingContext2D, t: Target) {
  const left = Math.max(0, 1 - t.age / t.life);
  const urgent = left < URGENT_AT;

  // The disc. Two flat fills — a body and a lighter core — so the centre
  // reads as the place to aim rather than the whole circle being one blob.
  ctx.beginPath();
  ctx.arc(t.x, t.y, T.TARGET_R, 0, Math.PI * 2);
  ctx.fillStyle = urgent ? "#3b1d05" : "#10233f";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(t.x, t.y, T.TARGET_R * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = urgent ? URGENT : ACCENT;
  ctx.fill();

  /*
   * The window, as an arc that closes clockwise from twelve.
   *
   * Drawn on the outside of the disc rather than as a shrinking fill, so the
   * thing the player is aiming at never changes size. A target that shrinks
   * is a target that gets harder to hit as it gets more urgent, which
   * compounds two difficulties the design deliberately keeps separate.
   */
  ctx.beginPath();
  ctx.arc(
    t.x,
    t.y,
    T.TARGET_R - 5,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * left
  );
  ctx.strokeStyle = urgent ? URGENT : ACCENT;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.stroke();
}

export function createRenderer(): Renderer {
  return {
    draw(ctx, sim, canvasW, canvasH, burst, shake, rng) {
      const v = fitView(canvasW, canvasH, T.VIEW_W, T.VIEW_H);
      enterView(ctx, v, canvasW, canvasH, BACKDROP);

      /*
       * The shake is applied to the whole view, inside the letterbox.
       *
       * Inside, so the black bars do not move with it — a shaking letterbox
       * reads as the screen being broken rather than as the game being hit.
       */
      if (shake > 0) {
        const k = (shake / T.SHAKE_TIME) * T.SHAKE_AMP;
        ctx.translate((rng() - 0.5) * k, (rng() - 0.5) * k);
      }

      ctx.fillStyle = FIELD;
      ctx.fillRect(0, 0, T.VIEW_W, T.VIEW_H);
      // Tiled in view pixels, which is what `fill` wants: the pattern repeats
      // in user space, so the tile size has to be stated in the caller's own
      // units or it stretches with the letterbox scale.
      ctx.fillStyle = GRAIN.fill(ctx, 64);
      ctx.fillRect(0, 0, T.VIEW_W, T.VIEW_H);

      // The inset the targets live within, drawn faintly so the field has an
      // edge. Without it the play area is the whole letterbox and the corners
      // look like places a target might appear.
      ctx.strokeStyle = "rgba(238,241,255,0.06)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        T.EDGE_INSET - T.TARGET_R,
        T.EDGE_INSET - T.TARGET_R,
        T.VIEW_W - (T.EDGE_INSET - T.TARGET_R) * 2,
        T.VIEW_H - (T.EDGE_INSET - T.TARGET_R) * 2
      );

      for (const t of sim.targets) drawTarget(ctx, t);

      // The hit burst: one expanding, fading ring where the last target was.
      if (burst > 0 && sim.lastHit) {
        const p = 1 - burst / T.BURST_TIME;
        ctx.beginPath();
        ctx.arc(sim.lastHit.x, sim.lastHit.y, T.TARGET_R + p * 46, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,211,238,${(1 - p) * 0.8})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      /*
       * Lives, as pips in the corner.
       *
       * Drawn rather than written, because a number that goes 3, 2, 1 has to
       * be read and a row of pips that loses one is seen. The spent ones stay
       * as outlines so the row never changes width and the eye is not asked
       * to re-find it.
       */
      for (let i = 0; i < T.LIVES; i++) {
        const x = 30 + i * 26;
        ctx.beginPath();
        ctx.arc(x, 30, 8, 0, Math.PI * 2);
        if (i < sim.lives) {
          ctx.fillStyle = ACCENT;
          ctx.fill();
        } else {
          ctx.strokeStyle = "rgba(238,241,255,0.25)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // The streak, only once it is worth mentioning. A "x1" on every hit is
      // a readout that never says anything.
      if (sim.streak >= 2) {
        ctx.fillStyle = INK;
        ctx.font = "600 26px ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(`x${sim.streak}`, T.VIEW_W - 26, 18);
      }

      ctx.restore();
    },
    destroy() {
      // The grain tile is a module-scope singleton shared by every run of
      // this cabinet, like the palette materials in the world: a bounded key
      // space with nothing to reclaim. Nothing is allocated per instance.
    },
  };
}
