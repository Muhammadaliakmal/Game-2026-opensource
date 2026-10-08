import type { MetadataRoute } from "next";
import { publishedPosts } from "@/lib/blog";
import { REGISTRY } from "@/content/registry";
import { SITE_URL } from "@/lib/site";
import { PARTY, RACE } from "@/lib/features";

/**
 * The sitemap.
 *
 * ── Only what a signed-out visitor can actually read ─────────────────────
 *
 * A sitemap listing pages that answer with a sign-in wall, or with an empty
 * shell until a session exists, is worse than a short one: it is what makes a
 * crawler decide a site is thin. So this is the public surface and nothing
 * else — the modes, the guides, the gallery, and the publisher pages an ad
 * review goes looking for.
 *
 * ── Why `/play/<slug>` is no longer in it ────────────────────────────────
 *
 * It used to list every built-in world at the URL that plays it, and that was
 * the single biggest problem with this domain. `/play/<slug>` is a canvas: a
 * crawler that fetches it gets a document with no words in it, and there are
 * twenty-seven of them. A sitemap is a list of pages you are asking to be
 * judged on, and that list was twenty-seven wordless documents.
 *
 * They are replaced one-for-one by `/games/<slug>`, which is the written
 * guide to the same world — what it is, how it is built, the measured shape
 * of the route, how to play it. Same worlds, same count, with the readable
 * half of each one now having somewhere to live. `/play/<slug>` is `noindex`
 * and canonicalises here; see that route.
 *
 * ── The publisher pages are content, not boilerplate ─────────────────────
 *
 * About, Contact and Terms are listed beside the policy because an ad review
 * is an assessment of a publisher and those pages are the only place a
 * publisher exists on a site made of WebGL. `/how-courses-are-made` is there
 * for the same reason in the other direction: it is the editorial-standards
 * page, and it is the one that explains why anything else on the site should
 * be believed.
 *
 * The blog is listed only when it has something in it: a sitemap that
 * promises a crawler a page which 404s is a worse first impression than one
 * that never mentions it.
 *
 * `/shop` is absent because it is `noindex`: it is a wallet and a grid that
 * arrive after a fetch, so a crawler gets a hundred and forty words of chrome
 * from it. An account screen is not an article and there is nothing to fix by
 * writing more on it.
 *
 * `/build` is absent because `robots.ts` disallows it — it needs a world id
 * and a session to be anything but an empty grid, and it is hidden outright
 * in v1 (`lib/features`). `/download` is absent too; the spec calls it a dead
 * end, and a sitemap is not the place to argue with that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/games`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/parkour`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...(RACE
      ? [{ url: `${SITE_URL}/race`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 }]
      : []),
    ...(PARTY
      ? [{ url: `${SITE_URL}/party`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 }]
      : []),
    { url: `${SITE_URL}/arcade`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/how-courses-are-made`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/controls`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Only when written. `publishedPosts()` is empty until then, so this whole
  // section — index and posts — is absent rather than promised.
  const posts = publishedPosts();
  const blog: MetadataRoute.Sitemap = posts.length
    ? [
        {
          url: `${SITE_URL}/blog`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        },
        ...posts.map((post) => ({
          url: `${SITE_URL}/blog/${post.slug}`,
          lastModified: new Date(`${post.date}T00:00:00Z`),
          changeFrequency: "yearly" as const,
          priority: 0.6,
        })),
      ]
    : [];

  // One guide per playable thing. Derived from the registry rather than
  // listed, so a cabinet or a course added there cannot be left out of here —
  // which is the mistake that leaves a real page unindexed for a month.
  const guides: MetadataRoute.Sitemap = REGISTRY.filter((e) =>
    ["course", "world", "arcade"].includes(e.kind)
  ).map((e) => ({
    url: `${SITE_URL}/games/${e.slug}`,
    lastModified: new Date(`${e.addedAt}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...fixed, ...blog, ...guides];
}
