import robotSrc from "./art/robot.webp";
import itemsSrc from "./art/items.webp";
import vfxSrc from "./art/vfx.webp";
import uiSrc from "./art/ui.webp";
import tilesSrc from "./art/tiles.webp";
import bgFarSrc from "./art/bg_far.webp";
import bgMidSrc from "./art/bg_mid.webp";
import { ROBOT, type Frame } from "./art/frames";

/**
 * The asset pack's sheets, loaded once and tinted once.
 *
 * ── Imported, so they are cached like code ───────────────────────────────
 *
 * Each sheet is a static import, which the bundler emits under
 * `/_next/static/media/` — the one prefix `public/sw.js` already caches. The
 * cabinet therefore works offline with its art exactly when it works offline
 * at all. See `scripts/build-duel-art.ts`.
 *
 * ── The art is optional; the game is not ─────────────────────────────────
 *
 * `loadSprites` never rejects. If a sheet fails, the renderer draws the
 * vector fighters it had before the pack arrived — a duel with plain art is
 * a duel, and a cabinet that refuses to open over a missing image is not.
 *
 * ── Tinted once ──────────────────────────────────────────────────────────
 *
 * The limbs, hands and feet are greyscale in the pack so one sheet serves
 * every colour. Each fighter's colour is multiplied in ONCE, into a small
 * offscreen canvas per part, rather than per frame: a per-frame tint is a
 * composite operation per limb per frame, and eight limbs times two robots
 * is sixteen of them.
 */

export interface Tinted {
  upper: CanvasImageSource;
  lower: CanvasImageSource;
  hand: CanvasImageSource;
  foot: CanvasImageSource;
}

export interface Sprites {
  robot: CanvasImageSource;
  items: CanvasImageSource;
  vfx: CanvasImageSource;
  ui: CanvasImageSource;
  tiles: CanvasImageSource;
  bgFar: CanvasImageSource;
  bgMid: CanvasImageSource;
  tinted: readonly [Tinted, Tinted];
}

/** Limb colours, per player. The mockup's violet and amber. */
export const TINTS = ["#a654f4", "#f29d0c"] as const;

let loaded: Sprites | null = null;
let pending: Promise<Sprites | null> | null = null;

/** The sheets, if they have loaded. Null means draw the vector fallback. */
export const sprites = (): Sprites | null => loaded;

function image(src: { src: string } | string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = typeof src === "string" ? src : src.src;
  return img.decode().then(() => img);
}

function tint(sheet: HTMLImageElement, f: Frame, color: string): CanvasImageSource {
  const [x, y, w, h] = f;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return sheet;
  g.drawImage(sheet, x, y, w, h, 0, 0, w, h);
  // Multiply the colour over the grey, then cut it back to the part's shape.
  g.globalCompositeOperation = "multiply";
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(sheet, x, y, w, h, 0, 0, w, h);
  return c;
}

/** Load every sheet. Resolves null, never rejects, if any of them fails. */
export function loadSprites(): Promise<Sprites | null> {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  pending = Promise.all([robotSrc, itemsSrc, vfxSrc, uiSrc, tilesSrc, bgFarSrc, bgMidSrc].map(image))
    .then(([robot, items, vfx, ui, tiles, bgFar, bgMid]) => {
      const tinted = TINTS.map((color) => ({
        upper: tint(robot, ROBOT["robot/limb_upper"], color),
        lower: tint(robot, ROBOT["robot/limb_lower"], color),
        hand: tint(robot, ROBOT["robot/hand"], color),
        foot: tint(robot, ROBOT["robot/foot"], color),
      })) as unknown as readonly [Tinted, Tinted];
      loaded = { robot, items, vfx, ui, tiles, bgFar, bgMid, tinted };
      return loaded;
    })
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}
