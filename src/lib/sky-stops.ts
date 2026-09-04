/**
 * The two sky gradients, as data, with nothing imported.
 *
 * ── Why these are not in atmosphere.ts ───────────────────────────────────
 *
 * They were, and that is still where they belong conceptually — `atmosphere.ts`
 * re-exports both, so "every number that decides what the sky looks like, in
 * one file" is still true from a reader's point of view.
 *
 * They physically live here because `atmosphere.ts` opens with
 * `import * as THREE from "three"`, and the mode covers on the home page are
 * *server* components that want four hex strings. Importing them from
 * atmosphere would pull the whole of three.js into the server bundle to render
 * a `<linearGradient>` — a few hundred kilobytes and a slower cold start, for
 * colour values that are text.
 *
 * So: the data has no dependencies, and everything that needs three.js as well
 * goes on importing from `atmosphere.ts` exactly as before.
 */

/** A gradient up the sky dome. `at` is 0 at the horizon, 1 at the zenith. */
export type SkyStops = readonly { readonly at: number; readonly hex: string }[];

/**
 * The sunset ramp, bottom to top, as MAP.md §4.2 specifies it.
 *
 * Authored in sRGB because that is how anyone reasoning about colour thinks,
 * and converted to linear working space exactly once, in `atmosphere.ts`.
 * Lerping sRGB values directly is what turns the mid-tones muddy: the midpoint
 * of two sRGB numbers is not the colour halfway between the two lights they
 * represent.
 */
export const SKY_STOPS = [
  { at: 0.0, hex: "#FFC28A", note: "horizon — bright, slightly desaturated" },
  { at: 0.1, hex: "#F2A277", note: "lower — THIS IS THE FOG COLOUR" },
  { at: 0.28, hex: "#C6577A", note: "mid — rose" },
  { at: 0.55, hex: "#5B4A8A", note: "upper — the transition that sells it" },
  { at: 1.0, hex: "#1B2A5B", note: "zenith — deep indigo, never black" },
] as const;

/**
 * The night ramp, bottom to top.
 *
 * "Dark blue to black" literally: a blue that is still recognisably blue at
 * the horizon, and true black overhead. The zenith being black rather than
 * near-black is deliberate and is the opposite of the sunset's rule — there, a
 * black zenith would have read as a bug in the gradient; here it is what lets
 * the stars carry the top of the frame on their own.
 *
 * ── Why these are darker than they first were ────────────────────────────
 *
 * The first pass put the horizon at #16224e, which is a perfectly good navy in
 * isolation and was far too bright in place. A chase camera looks along the
 * ground, so most of the frame is the BOTTOM of this ramp — and against that
 * much mid-blue the track, which is #0f172a asphalt, read as a black hole with
 * a bright sky over it. A sky is a backdrop. If it is the brightest thing on
 * screen it is not doing its job.
 */
export const NIGHT_STOPS = [
  { at: 0.0, hex: "#0c1433", note: "horizon — deep blue, still blue" },
  { at: 0.1, hex: "#080e26", note: "lower — THIS IS THE FOG COLOUR" },
  { at: 0.32, hex: "#050818", note: "mid — the blue draining out" },
  { at: 0.62, hex: "#02030c", note: "upper — nearly gone" },
  { at: 1.0, hex: "#000000", note: "zenith — black, so the stars own it" },
] as const;
