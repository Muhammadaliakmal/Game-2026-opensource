/**
 * Whether to spend somebody's bandwidth on a page they have not opened yet.
 *
 * ── Why this is a question at all ────────────────────────────────────────
 *
 * The canvas chunks are the largest thing this app has: three.js and Rapier
 * together are about 1.1 MB gzipped, and the game cannot draw a frame without
 * them. Fetching them early is the single biggest thing that can be done about
 * load time — see `PrefetchCanvas` — but "early" means downloading a megabyte
 * for a visitor who may only be reading the About page.
 *
 * So it is guarded, and the guard is deliberately narrow: this is a prefetch,
 * not a feature, and the correct behaviour on a metered or slow connection is
 * to do nothing at all and let the load happen when the player actually asks
 * for it.
 *
 * ── Unknown means yes, and that is the right default ─────────────────────
 *
 * `navigator.connection` is Chromium-only. Safari and Firefox report nothing,
 * which is most of the phones this has to be right on. Treating "no
 * information" as "assume a slow connection" would disable the optimisation
 * for the browsers that need it most; treating it as "assume a fast one"
 * matches what every other link prefetch on the web already does, including
 * Next's own `<Link>`.
 *
 * Pure, and separate from the component, so the decision can be tested without
 * a DOM — the component around it is four lines and a `requestIdleCallback`.
 */

/** The half of `NetworkInformation` that is worth asking about. */
export interface ConnectionHint {
  /** The browser's Data Saver setting, or a proxy for it. */
  saveData?: boolean;
  /** "slow-2g" | "2g" | "3g" | "4g", by round-trip estimate. */
  effectiveType?: string;
}

/**
 * `true` when a megabyte of speculative download is a reasonable thing to do.
 *
 * Data Saver is a direct instruction and always wins. Anything below 4g is a
 * connection where a speculative megabyte competes with the page the visitor
 * is actually reading, and losing that race is worse than a slower start on
 * the page they might not open.
 */
export function shouldPrefetch(hint?: ConnectionHint | null): boolean {
  if (!hint) return true;
  if (hint.saveData) return false;
  if (hint.effectiveType === undefined) return true;
  return hint.effectiveType === "4g";
}

/** `navigator.connection`, where it exists. */
export function connectionHint(): ConnectionHint | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { connection?: ConnectionHint };
  return nav.connection ?? null;
}
