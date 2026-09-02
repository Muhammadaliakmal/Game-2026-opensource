/**
 * SPEC §12 Phase 4 / §13: capture the build canvas as a browse-page cover.
 *
 * Storage note (a deliberate deviation from SPEC §12's "canvas thumbnail via
 * toDataURL() → R2"): R2 isn't configured for this deployment yet (see
 * scripts/upload-props.ts's own note), and a thumbnail is small enough —
 * capped and downscaled here — to live directly in the `worlds.thumbnail_url`
 * text column as a data URI. Same column either way, so swapping in a real R2
 * upload later (presignUpload + publicUrl from lib/r2.ts) is a change to
 * where this string comes from, not to the schema or to any caller.
 *
 * Downscaled independently of the canvas's own resolution (which follows the
 * device's viewport and pixel ratio) so a thumbnail is a few KB regardless of
 * whether it was captured on a phone or a 4K monitor.
 */
export function captureThumbnail(
  canvas: HTMLCanvasElement,
  maxWidth = 384,
  maxHeight = 216,
  quality = 0.72
): string | null {
  if (canvas.width === 0 || canvas.height === 0) return null;

  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(canvas, 0, 0, width, height);
  try {
    return out.toDataURL("image/jpeg", quality);
  } catch {
    // A tainted canvas (e.g. a cross-origin texture without CORS headers)
    // throws here rather than returning garbage — skip the thumbnail rather
    // than fail the save over a cosmetic.
    return null;
  }
}
