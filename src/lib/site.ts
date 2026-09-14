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
export const SITE_NAME = "Spec Driven Games";

/**
 * The same name where the space is not there to spend.
 *
 * A PWA's `short_name` is what sits under the icon on a home screen, and the
 * launcher truncates it rather than wrapping — Android gives it about twelve
 * characters before it becomes an ellipsis. "Spec Driven" is the name that
 * survives that; the full one does not.
 */
export const SITE_SHORT_NAME = "Spec Driven";

/** The publisher, under their own name. */
export const OWNER_NAME = "Muhammad Ali Akmal";

/** Where they are, which an identity review does look for. */
export const OWNER_LOCATION = "Karachi, Pakistan";

/**
 * One address, on every page that offers one.
 *
 * ── Why one and not two ──────────────────────────────────────────────────
 *
 * The privacy policy used to publish `privacy@specdrivengames.com` while
 * everything else pointed at a personal inbox. Two contact addresses on one
 * small site is a credibility problem before it is a routing problem, and the
 * routing problem is the worse half: `specdrivengames.com` has DNS but no
 * mailbox, so a data-deletion request or an ad reviewer writing to `privacy@`
 * would bounce, silently, at exactly the moment it mattered.
 *
 * An address that receives mail beats an address that looks official. When
 * there is a mailbox on the domain, this is the one line that has to change.
 */
export const CONTACT_EMAIL = "funnya894@gmail.com";
