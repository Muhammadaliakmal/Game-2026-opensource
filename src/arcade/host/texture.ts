/**
 * Procedural surfaces for the arcade's canvases.
 *
 * ── What a "texture" is on a 2D canvas ───────────────────────────────────
 *
 * The same thing it is in the world renderer: a small tile that repeats. Here
 * each one is painted ONCE into an offscreen canvas at construction and
 * handed back as a `CanvasPattern`, so per frame a textured surface costs
 * exactly what a flat one does — one `fillRect`. Nothing here draws per
 * pixel per frame, and nothing here uses `shadowBlur`, for the reasons the
 * tower's renderer already gives.
 *
 * ── Why every tile is generated rather than downloaded ───────────────────
 *
 * A cabinet is loaded lazily and plays in under two minutes; a 200 KB image
 * per game would be most of the download for a picture the player looks at
 * for ninety seconds. Everything below is a few hundred bytes of code and
 * takes under a millisecond to paint. It is also seeded, so a tile is the
 * same tile on every run and in every screenshot.
 *
 * ── Fallbacks are the contract ───────────────────────────────────────────
 *
 * `render.test.ts` drives the renderers through a recording Proxy with no
 * `document` and a `createPattern` that returns nothing. Every helper here
 * returns a plain colour in that case, so a renderer never has to check —
 * it asks for a fill and paints with whatever comes back.
 */

export type Fill = string | CanvasPattern;

/** mulberry32, the arcade's own generator, so a tile is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Texture {
  /**
   * A fill for `ctx`, tiling every `unitsPerTile` of the CURRENT transform.
   *
   * A pattern repeats in user space, so a 64px tile drawn under a 40× board
   * scale would repeat every 40 board units — once per board. Passing the
   * tile size in the caller's own units fixes it: a board asks for 2 (two
   * cells), a pixel-space game asks for the tile's own pixel size.
   */
  fill(ctx: CanvasRenderingContext2D, unitsPerTile: number): Fill;
}

/**
 * A tile painted by `paint`, cached per context and per requested scale.
 * `fallback` is what it is when there is no canvas to paint into.
 */
export function makeTexture(
  size: number,
  fallback: string,
  paint: (g: CanvasRenderingContext2D, size: number, r: () => number) => void,
  seed = 1
): Texture {
  let tile: HTMLCanvasElement | null | undefined;
  const cache = new WeakMap<CanvasRenderingContext2D, Map<number, Fill>>();

  function build(): HTMLCanvasElement | null {
    if (tile !== undefined) return tile;
    if (typeof document === "undefined") return (tile = null);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    if (!g) return (tile = null);
    paint(g, size, rng(seed));
    return (tile = c);
  }

  return {
    fill(ctx, unitsPerTile) {
      let byScale = cache.get(ctx);
      if (!byScale) cache.set(ctx, (byScale = new Map()));
      const hit = byScale.get(unitsPerTile);
      if (hit) return hit;

      let out: Fill = fallback;
      const c = build();
      if (c) {
        try {
          const p = ctx.createPattern(c, "repeat");
          if (p) {
            const k = unitsPerTile / size;
            // Older engines lack setTransform on patterns; they get the
            // unscaled tile, which is still a texture, just a coarser one.
            if (k !== 1 && typeof p.setTransform === "function" && typeof DOMMatrix !== "undefined") {
              p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
            }
            out = p;
          }
        } catch {
          out = fallback;
        }
      }
      byScale.set(unitsPerTile, out);
      return out;
    },
  };
}

/**
 * Fine grain to lay over a flat colour: transparent, with sparse light and
 * dark specks. One `fillRect` of this over any colour is what turns a
 * rectangle into a surface, and because it is transparent, one tile serves
 * every colour in the game.
 */
export function grainOverlay(seed: number, amount = 0.16, size = 64): Texture {
  return makeTexture(
    size,
    "rgba(0,0,0,0)",
    (g, s, r) => {
      const img = g.createImageData(s, s);
      const d = img.data;
      for (let i = 0; i < s * s; i++) {
        const v = r();
        const light = v > 0.5;
        const a = Math.pow(Math.abs(v - 0.5) * 2, 2.2) * amount * 255;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = light ? 255 : 0;
        d[i * 4 + 3] = a;
      }
      g.putImageData(img, 0, 0);
    },
    seed
  );
}

/**
 * Paper: a warm near-white with fibre flecks and a faint laid texture. The
 * boards are printed on this. Opaque, so it is the board fill itself.
 */
export function paperTexture(base = "#F3F1EA", seed = 7, size = 96): Texture {
  return makeTexture(
    size,
    base,
    (g, s, r) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      // Laid lines: the faint horizontal ribs of a sheet held to the light.
      g.fillStyle = "rgba(18,21,28,0.035)";
      for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1);
      // Fibres: short strokes at slight angles, lighter and darker.
      for (let i = 0; i < 140; i++) {
        const x = r() * s;
        const y = r() * s;
        const len = 2 + r() * 5;
        const a = (r() - 0.5) * 0.8;
        g.strokeStyle = r() > 0.5 ? "rgba(255,255,255,0.55)" : "rgba(18,21,28,0.08)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      }
      // Specks.
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(18,21,28,${0.04 + r() * 0.08})`;
        g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1);
      }
    },
    seed
  );
}

/**
 * Wood: grain running along x, in bands that wander slightly, with a few
 * darker streaks. For the frame a board sits in.
 */
export function woodTexture(seed = 11, size = 128): Texture {
  return makeTexture(
    size,
    "#6B4A2B",
    (g, s, r) => {
      g.fillStyle = "#7A5533";
      g.fillRect(0, 0, s, s);
      // Bands of slightly different tone, each a wavy horizontal strip.
      for (let i = 0; i < 26; i++) {
        const y0 = r() * s;
        const h = 1 + r() * 3;
        const dark = r() > 0.5;
        g.fillStyle = dark ? `rgba(60,35,15,${0.18 + r() * 0.25})` : `rgba(200,150,95,${0.1 + r() * 0.2})`;
        g.beginPath();
        const wobble = 1 + r() * 2.5;
        const phase = r() * Math.PI * 2;
        g.moveTo(0, y0);
        for (let x = 0; x <= s; x += 8) {
          g.lineTo(x, y0 + Math.sin(phase + (x / s) * Math.PI * 2) * wobble);
        }
        for (let x = s; x >= 0; x -= 8) {
          g.lineTo(x, y0 + h + Math.sin(phase + (x / s) * Math.PI * 2) * wobble);
        }
        g.closePath();
        g.fill();
      }
      // Fine grain lines.
      g.fillStyle = "rgba(40,22,8,0.16)";
      for (let i = 0; i < 90; i++) {
        const y = Math.floor(r() * s);
        const x = Math.floor(r() * s);
        g.fillRect(x, y, 6 + Math.floor(r() * 26), 1);
      }
    },
    seed
  );
}

/**
 * Riveted plate: dark panels with a lighter seam and a rivet at each corner.
 * Runner platforms and tower blocks lay this over their own colour, so the
 * tile is mostly transparent and only the seams and rivets are ink.
 */
export function plateOverlay(seed = 3, size = 48): Texture {
  return makeTexture(
    size,
    "rgba(0,0,0,0)",
    (g, s, r) => {
      const half = s / 2;
      // Two panels per tile, offset like brickwork, each with a bevel: a
      // light edge at the top-left and a dark one at the bottom-right.
      const panel = (x: number, y: number, w: number, h: number) => {
        g.fillStyle = "rgba(255,255,255,0.13)";
        g.fillRect(x, y, w, 1);
        g.fillRect(x, y, 1, h);
        g.fillStyle = "rgba(0,0,0,0.32)";
        g.fillRect(x, y + h - 1, w, 1);
        g.fillRect(x + w - 1, y, 1, h);
        // Rivets, inset from the corners.
        g.fillStyle = "rgba(0,0,0,0.35)";
        for (const [rx, ry] of [
          [x + 3, y + 3],
          [x + w - 4, y + 3],
          [x + 3, y + h - 4],
          [x + w - 4, y + h - 4],
        ]) {
          g.fillRect(rx, ry, 2, 2);
        }
        g.fillStyle = "rgba(255,255,255,0.22)";
        for (const [rx, ry] of [
          [x + 3, y + 3],
          [x + w - 4, y + 3],
          [x + 3, y + h - 4],
          [x + w - 4, y + h - 4],
        ]) {
          g.fillRect(rx, ry, 1, 1);
        }
      };
      panel(0, 0, s, half);
      panel(0, half, half, half);
      panel(half, half, half, half);
      // A little wear.
      g.fillStyle = "rgba(0,0,0,0.12)";
      for (let i = 0; i < 24; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1 + Math.floor(r() * 3), 1);
    },
    seed
  );
}

/**
 * A bevelled rectangle: the fill, a light top edge, a dark bottom edge. Three
 * `fillRect`s, and a flat block reads as a solid one. `edge` is in the
 * caller's units.
 */
export function bevelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: Fill,
  edge = 2
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x, y, w, edge);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x, y + h - edge, w, edge);
}
