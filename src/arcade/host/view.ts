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

/** Where `enterView` put the board this frame, per context, in CSS pixels. */
const boards = new WeakMap<CanvasRenderingContext2D, { x: number; y: number; w: number; h: number }>();

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
  boards.set(ctx, { x: v.ox, y: v.oy, w: canvasW - 2 * v.ox, h: canvasH - 2 * v.oy });
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

let scratch: HTMLCanvasElement | null = null;

/**
 * Paint the letterbox with the board's own edges, blurred and dimmed.
 *
 * The view is fixed (see `VIEW_W`), so a screen wider than 16:9 — most phones
 * held sideways are 20:9 — leaves a flat band down each side, and inside the
 * app that read as the game not being fullscreen. Stretching the view would
 * distort every cabinet and move its simulation; cropping it would cut off a
 * floor or a score. So the bands borrow the picture beside them instead, the
 * way a phone shows a portrait video on a landscape screen.
 *
 * Cheap on purpose, since it runs every frame: each edge band is drawn into a
 * canvas a few pixels across and scaled back up with smoothing on, which is
 * the blur — no `ctx.filter`, which costs a full-resolution pass on a phone.
 *
 * The host calls this after `render`. A cabinet that did not call `enterView`
 * this frame (the board games) has no entry, and nothing happens. The entry is
 * consumed, so a stale board can never be painted from.
 */
export function fillLetterbox(ctx: CanvasRenderingContext2D): void {
  const b = boards.get(ctx);
  if (!b) return;
  boards.delete(ctx);
  if (b.x < 2 && b.y < 2) return;
  if (typeof document === "undefined") return;

  const dpr = ctx.getTransform().a || 1;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const bx = Math.round(b.x * dpr);
  const by = Math.round(b.y * dpr);
  const bw = Math.round(b.w * dpr);
  const bh = Math.round(b.h * dpr);

  scratch ??= document.createElement("canvas");
  const s = scratch.getContext("2d");
  if (!s) return;

  const smear = (
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    cols: number, rows: number
  ) => {
    if (sw < 1 || sh < 1 || dw < 1 || dh < 1) return;
    scratch!.width = cols;
    scratch!.height = rows;
    s.imageSmoothingEnabled = true;
    s.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, cols, rows);
    ctx.drawImage(scratch!, 0, 0, cols, rows, dx, dy, dw, dh);
  };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";

  if (bx >= 2) {
    const band = Math.min(bx, Math.round(bw / 3));
    smear(bx, by, band, bh, 0, by, bx, bh, 4, 24);
    smear(bx + bw - band, by, band, bh, bx + bw, by, W - bx - bw, bh, 4, 24);
    ctx.fillRect(0, by, bx, bh);
    ctx.fillRect(bx + bw, by, W - bx - bw, bh);
  }
  if (by >= 2) {
    const band = Math.min(by, Math.round(bh / 3));
    smear(bx, by, bw, band, bx, 0, bw, by, 24, 4);
    smear(bx, by + bh - band, bw, band, bx, by + bh, bw, H - by - bh, 24, 4);
    ctx.fillRect(bx, 0, bw, by);
    ctx.fillRect(bx, by + bh, bw, H - by - bh);
  }

  ctx.restore();
}
