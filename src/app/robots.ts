import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt.
 *
 * ── Mediapartners-Google is why this file is explicit ────────────────────
 *
 * An AdSense review fails when the reviewing crawler cannot fetch the page it
 * is meant to be judging, and the default when no robots.txt exists is
 * permissive-by-accident rather than permissive-by-decision. Saying "allow"
 * out loud costs nothing and removes a whole class of "why was I rejected"
 * that has no error message attached to it.
 *
 * ── What is disallowed, and why it is not the content ────────────────────
 *
 * Only routes that are meaningless to an indexer: the API, and the editor,
 * which needs a world id and a session to be anything but an empty grid.
 * Everything a player can actually read — the modes, the courses, the
 * gallery, the policy — stays crawlable, because that is the content an ad
 * review is assessing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/build/"] },
      // Named separately and deliberately: this is the AdSense crawler, and it
      // is the one that must never be caught by a future tightening of the
      // rule above.
      { userAgent: "Mediapartners-Google", allow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
