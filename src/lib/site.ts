/**
 * Where this app lives, as one string.
 *
 * `robots.ts`, `sitemap.ts` and the `metadataBase` in the root layout all need
 * an absolute origin, and each one silently does something unhelpful without
 * it: a sitemap of relative URLs is invalid, and `metadataBase` unset makes
 * Next resolve Open Graph images against `localhost:3000`, which is how a
 * shared link ends up with no preview image and nobody notices for a month.
 *
 * A constant rather than an env var, for the reason `lib/features.ts` gives:
 * it is the same on every deploy that matters and it belongs where a diff can
 * show it changing.
 */
export const SITE_URL = "https://specdrivengames.com";

/** The name used in metadata, the sitemap, and the privacy policy. */
export const SITE_NAME = "Blockworld";
