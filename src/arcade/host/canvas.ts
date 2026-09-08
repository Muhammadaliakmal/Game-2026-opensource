/**
 * DPR-aware canvas sizing.
 *
 * Setting `width`/`height` clears the canvas and resets the context's
 * transform, so this must only fire when the pixel dimensions actually change
 * — called every frame it would blank the game.
 *
 * The DPR is capped at 2 for the reason `lib/quality.ts` caps the world's: a
 * DPR-3 phone renders every pixel nine times over, and a game drawn in flat
 * blocks gains nothing visible past 2 for triple the fill cost.
 */
export const MAX_DPR = 2;

export function resizeCanvas(
  c: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = c.clientWidth;
  const h = c.clientHeight;
  const px = Math.round(w * dpr);
  const py = Math.round(h * dpr);
  if (c.width === px && c.height === py) return false;

  c.width = px;
  c.height = py;
  // Every game draws in CSS pixels and never thinks about the ratio again.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Blocky art stays blocky. A smoothed 8px sprite scaled up is a smear.
  ctx.imageSmoothingEnabled = false;
  return true;
}
