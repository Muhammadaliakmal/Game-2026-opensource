import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { formatDate, postBody, postBySlug, publishedPosts } from "@/lib/blog";
import { OWNER_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * One post.
 *
 * ── Static, and only for posts that exist ────────────────────────────────
 *
 * `generateStaticParams` returns the published slugs and nothing else, so a
 * planned post has no route at all rather than a route that renders an empty
 * article. Combined with `dynamicParams = false`, a slug nobody has written is
 * a 404 at build time instead of a page that half-works in production.
 *
 * ── The words are a component, not a string in a database ────────────────
 *
 * A post is a `.tsx` file under `src/content/blog/`, which means it is typed,
 * reviewable in a diff, and can contain a real screenshot or a working
 * example rather than an image tag in a markdown blob. The cost is that a new
 * post needs a line in `lib/blog.ts`; `blog.test.ts` is what makes forgetting
 * it a failed test rather than a broken link.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return publishedPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};

  return {
    title: `${post.title} · ${SITE_NAME}`,
    description: post.summary,
    alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
    // An article rather than a website, with a date and an author on it. This
    // is the difference between a page a crawler files as content and one it
    // files as another route on a game site.
    openGraph: {
      type: "article",
      title: post.title,
      description: post.summary,
      publishedTime: post.date,
      authors: [OWNER_NAME],
      url: `${SITE_URL}/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(slug);
  const load = postBody(slug);
  // Published without a body registered: the row says the post exists and no
  // file does. A 404 is better than an article with nothing in it, and the
  // test suite is meant to catch this long before a reader does.
  if (!post || !load) notFound();

  const { default: Body } = await load();

  return (
    <PageShell width="prose">
      <Breadcrumbs
        trail={[
          { href: "/", label: SITE_NAME },
          { href: "/blog", label: "Blog" },
          { href: `/blog/${post.slug}`, label: post.title },
        ]}
      />
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Link href="/blog" className="hud-label w-fit">
            ← Blog
          </Link>
          <h1 className="text-display font-bold">{post.title}</h1>
          <time dateTime={post.date} className="hud-label num">
            {formatDate(post.date)}
          </time>
        </header>

        {/* The post's own words. `text-dim` and the spacing live here rather
            than in every post file, so a post is prose and not a stylesheet. */}
        <div className="text-dim flex flex-col gap-4 text-sm leading-relaxed [&_h2]:text-ink [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_a]:text-accent [&_a]:underline [&_strong]:text-ink [&_em]:text-ink [&_em]:not-italic [&_em]:font-medium [&_code]:bg-surface [&_code]:text-ink [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
          <Body />
        </div>

        <footer className="border-t border-[var(--border-color)] pt-6">
          <p className="text-dim text-sm">
            Written by {OWNER_NAME}. More at{" "}
            <Link href="/blog" className="text-accent underline">
              the blog
            </Link>
            , or{" "}
            <Link href="/" className="text-accent underline">
              play the game
            </Link>
            .
          </p>
        </footer>
      </article>

      {/* Under the article, never in it — see lib/ads. */}
      <AdSlot placement="guide" />

      {/* A BlogPosting rather than a WebPage: a dated article with a named
          author is what turns this from another route on a game site into a
          piece of writing, to a crawler and to an ad review alike. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.summary,
          datePublished: post.date,
          dateModified: post.date,
          url: `${SITE_URL}/blog/${post.slug}`,
          author: { "@type": "Person", name: OWNER_NAME },
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
          },
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": `${SITE_URL}/blog/${post.slug}`,
          },
        }}
      />
    </PageShell>
  );
}
