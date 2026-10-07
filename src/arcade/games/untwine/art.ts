/**
 * The handful of pictures Untwine draws: hearts, a flag, a crown, a flame.
 *
 * They come from `public/ui/` (cut from the generated art in
 * `assets/raw-ui/` by `npm run ui:art`) as 4–7 KB WebPs. Loading never
 * fails the game — every picture has a drawn stand-in, and `loadArt`
 * resolves on a deadline even if the network never answers, because a
 * cabinet waiting on a heart icon is a cabinet that does not open.
 */

export const ART_NAMES = ["heart-green", "heart-gold", "crown", "flag", "fire"] as const;
export type ArtName = (typeof ART_NAMES)[number];

export const art: Partial<Record<ArtName, HTMLImageElement>> = {};

let loading: Promise<void> | null = null;

export function loadArt(): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  loading ??= Promise.race([
    Promise.all(
      ART_NAMES.map(
        (name) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              art[name] = img;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = `/ui/${name}.webp`;
          })
      )
    ).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);
  return loading;
}

/** Draw a picture centred on (x, y), or its stand-in if it never arrived. */
export function icon(
  ctx: CanvasRenderingContext2D,
  name: ArtName,
  x: number,
  y: number,
  size: number,
  alpha = 1
): void {
  const img = art[name];
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (img && img.complete && img.naturalWidth > 0) {
    const k = size / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  } else {
    ctx.fillStyle =
      name === "heart-green" ? "#46d17a" : name === "heart-gold" ? "#ffc53d" : name === "fire" ? "#ff6b3d" : "#ffd166";
    ctx.beginPath();
    ctx.arc(x, y, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
