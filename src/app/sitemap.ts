import type { MetadataRoute } from "next";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";
import { publishedPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

/**
 * The sitemap.
 *
 * ── Only what a signed-out visitor can actually read ─────────────────────
 *
 * A sitemap listing pages that answer with a sign-in wall, or with an empty
 * shell until a session exists, is worse than a short one: it is what makes a
 * crawler decide a site is thin. So this is the public surface and nothing
 * else — the modes, the built-in worlds anyone can play, the gallery, and the
 * privacy policy an ad review goes looking for.
 *
 * The built-in worlds are listed individually because they are real content
 * with names and blurbs at stable URLs, generated rather than stored, and
 * they are the only world pages guaranteed to exist for a stranger.
 *
 * `/build` is absent for the same reason `robots.ts` disallows it: it needs a
 * world id and a session to be anything but an empty grid, and it is hidden
 * outright in v1 (`lib/features`). `/download` is absent too — the spec calls
 * it a dead end, and a sitemap is not the place to argue with that.
 *
 * ── The publisher pages are content, not boilerplate ─────────────────────
 *
 * About, Contact and Terms are listed beside the policy because an ad review
 * is an assessment of a publisher and those four pages are the only place a
 * publisher exists on a site made of WebGL. The blog is listed only when it
 * has something in it: a sitemap that promises a crawler a page which 404s is
 * a worse first impression than one that never mentions it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/games`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/parkour`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/arena`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/race`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/arcade`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
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
          priority: 0.6,
        },
        ...posts.map((post) => ({
          url: `${SITE_URL}/blog/${post.slug}`,
          lastModified: new Date(`${post.date}T00:00:00Z`),
          changeFrequency: "yearly" as const,
          priority: 0.5,
        })),
      ]
    : [];

  const worlds: MetadataRoute.Sitemap = BUILT_IN_WORLDS.map((w) => ({
    url: `${SITE_URL}/play/${w.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...fixed, ...blog, ...worlds];
}
