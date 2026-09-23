/**
 * The game face, for canvas text.
 *
 * A canvas cannot read a CSS variable — `ctx.font` is parsed as a font
 * shorthand and `var()` is not in its grammar — and next/font gives the face
 * a generated family name, so the name cannot be written here either. The
 * root layout puts it on <html> as `--font-game`; this reads it once and
 * builds ordinary shorthands from it.
 *
 * No weight, ever. Lilita One ships one weight, and a `bold` or `800` in the
 * shorthand makes the browser smear a synthetic bold over it — the exact
 * thing that makes a web game's type look like a web page's.
 *
 * With no document (the render tests drive renderers under node) it is the
 * system face, and the renderers never need to know.
 */

const FALLBACK = "ui-sans-serif, system-ui, sans-serif";
let family: string | null = null;

function resolve(): string {
  if (family !== null) return family;
  let face = "";
  if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
    face = getComputedStyle(document.documentElement).getPropertyValue("--font-game").trim();
  }
  family = face ? `${face}, ${FALLBACK}` : FALLBACK;
  return family;
}

/** `ctx.font = gameFont(24)` — the game face at that many CSS pixels. */
export function gameFont(px: number): string {
  return `${px}px ${resolve()}`;
}

/**
 * Display text the way a game sets it: a thick dark outline, a solid drop
 * shadow under that, and the fill on top. The outline is stroked at twice
 * the width wanted because half of every stroke lies inside the glyph, and
 * the fill drawn over it hides that half — which is what `paint-order:
 * stroke fill` does for the site's headings in CSS.
 */
export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  px: number,
  outline = "#140806"
): void {
  const w = Math.max(2, px * 0.12);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = w * 2;
  ctx.strokeStyle = outline;
  ctx.fillStyle = outline;
  const drop = Math.max(2, px * 0.08);
  ctx.strokeText(text, x, y + drop);
  ctx.fillText(text, x, y + drop);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
