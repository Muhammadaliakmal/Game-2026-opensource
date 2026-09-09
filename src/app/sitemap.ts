import type { MetadataRoute } from "next";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";
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
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/parkour`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/race`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/arcade`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const worlds: MetadataRoute.Sitemap = BUILT_IN_WORLDS.map((w) => ({
    url: `${SITE_URL}/play/${w.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...fixed, ...worlds];
}
