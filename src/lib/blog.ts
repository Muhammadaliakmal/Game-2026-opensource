import type { ComponentType } from "react";

/**
 * The blog: what exists, what is only planned, and where the words live.
 *
 * ── Why a post can be "planned" and still be in this file ────────────────
 *
 * Because the alternative is worse than an empty list. An ad review's most
 * common rejection is "Low Value Content", and three placeholder posts about
 * a game — outlines, lorem, invented numbers — is precisely what that
 * rejection is for. A blog with nothing in it is merely absent; a blog with
 * three stubs in it is evidence against you.
 *
 * So a planned post is a row here and nothing else. It is not routed, not
 * listed, not in the sitemap, and not linked from the footer. Everything that
 * points at the blog asks {@link hasPosts} first, so the whole thing switches
 * on by itself the moment a real post lands — no seven files to remember.
 *
 * ── Writing one ──────────────────────────────────────────────────────────
 *
 * 1. Write it as a component in `src/content/blog/<slug>.tsx`.
 * 2. Add it to `BODIES` below — the map is explicit rather than a glob so the
 *    bundler can see every import statically.
 * 3. Set `status: "published"` and fill in the real date and summary.
 *
 * `blog.test.ts` holds those three steps together: a post that is published
 * without a body is a 404 on your own blog, linked from your own index, and
 * it is exactly the kind of mistake that ships on a Friday.
 *
 * The outlines to write from are in `docs/blog-outlines.md`, deliberately not
 * on the site.
 */

export interface BlogPost {
  /** URL segment. Also the content file's name. */
  readonly slug: string;
  readonly title: string;
  /** ISO `YYYY-MM-DD`. Meaningless until the post is published. */
  readonly date: string;
  /** One sentence, shown on the index and used as the meta description. */
  readonly summary: string;
  readonly status: "published" | "planned";
}

/**
 * Every post, written or not.
 *
 * The three planned ones are the set an ad review wants to see: what the thing
 * is, how it is designed, and why it is on the web at all. They are titled
 * because a title you have written is most of the way to a post; they are not
 * dated, because a date on an unwritten post is a promise.
 */
export const POSTS: readonly BlogPost[] = [
  {
    slug: "building-blockworld",
    title: "How Blockworld is built",
    date: "",
    summary: "",
    status: "planned",
  },
  {
    slug: "designing-the-courses",
    title: "Designing the courses",
    date: "",
    summary: "",
    status: "planned",
  },
  {
    slug: "why-browser-games",
    title: "Why browser games",
    date: "",
    summary: "",
    status: "planned",
  },
];

/**
 * Slug to content component.
 *
 * Empty until the first post is written, and that is the honest state rather
 * than an oversight. A lazy import per row, listed by hand: a dynamic
 * `import(\`@/content/blog/${slug}\`)` cannot be traced by the bundler, so it
 * either bloats the chunk with every possible match or resolves to nothing at
 * runtime, depending on the day.
 */
const BODIES: Record<string, () => Promise<{ default: ComponentType }>> = {
  // "building-blockworld": () => import("@/content/blog/building-blockworld"),
};

/** Newest first. The only list any page is allowed to render. */
export const publishedPosts = (): BlogPost[] =>
  POSTS.filter((p) => p.status === "published").sort((a, b) =>
    b.date.localeCompare(a.date)
  );

/**
 * Whether the blog is a place worth sending anybody yet.
 *
 * Read by the footer, the sitemap, and the About page, so a link to an empty
 * blog cannot exist. Everything turns on together.
 */
export const hasPosts = (): boolean => publishedPosts().length > 0;

export const postBySlug = (slug: string): BlogPost | undefined =>
  publishedPosts().find((p) => p.slug === slug);

/** The component for a post, or undefined if nobody has written it. */
export const postBody = (
  slug: string
): (() => Promise<{ default: ComponentType }>) | undefined => BODIES[slug];

/**
 * How a date is written on the site: 10 September 2026.
 *
 * Fixed to `en-GB` and UTC rather than the visitor's locale, because a date
 * rendered on the server and again in the browser must produce the same string
 * — a locale-dependent one is a hydration mismatch that only appears for
 * readers in another country.
 */
export const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
