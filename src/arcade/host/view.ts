/**
 * The fixed view, fitted to whatever canvas the host has.
 *
 * Every cabinet since Chunk Runner simulates and draws at one virtual size
 * and letterboxes it into the canvas — see `VIEW_W` in its tuning for why
 * that is a rule and not a convenience. The three puzzle cabinets also read
 * the pointer *in* that view, which is the same transform run backwards, so
 * the arithmetic lives here once rather than in three renderers and three
 * input seams that would disagree by a pixel.
 */
export interface View {
  /** Canvas pixels per view pixel. */
  k: number;
  /** Where the view's origin lands on the canvas. */
  ox: number;
  oy: number;
}

export function fitView(canvasW: number, canvasH: number, viewW: number, viewH: number): View {
  const k = Math.min(canvasW / viewW, canvasH / viewH);
  return {
    k,
    ox: Math.round((canvasW - viewW * k) / 2),
    oy: Math.round((canvasH - viewH * k) / 2),
  };
}

/** Fill the letterbox and set the transform. Pair with `ctx.restore()`. */
export function enterView(
  ctx: CanvasRenderingContext2D,
  v: View,
  canvasW: number,
  canvasH: number,
  backdrop: string
) {
  ctx.save();
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(v.ox, v.oy);
  ctx.scale(v.k, v.k);
}

/** A canvas point in view pixels. Outside the view is allowed and negative. */
export function toView(v: View, x: number, y: number): { x: number; y: number } {
  return { x: (x - v.ox) / v.k, y: (y - v.oy) / v.k };
}

/**
 * The edge of a press, from the host's level-only pointer.
 *
 * Every cabinet derives this itself because the host's own `pressed()` is
 * not part of `GameServices` — see `InputState` — and a tap that is down for
 * two steps must count as one.
 */
export function createTap() {
  let was = false;
  return (down: boolean): boolean => {
    const tapped = down && !was;
    was = down;
    return tapped;
  };
}
