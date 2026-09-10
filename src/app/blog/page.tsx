import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell, PageHeader } from "@/components/PageShell";
import { formatDate, publishedPosts } from "@/lib/blog";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The blog index.
 *
 * ── Why it 404s when there is nothing on it ──────────────────────────────
 *
 * Because an empty index is a thin page, and a thin page is the specific thing
 * an ad review penalises. Nothing links here while `publishedPosts()` is empty
 * — not the footer, not the About page, not the sitemap — so the only way to
 * reach this state is by typing the URL, and a 404 is the honest answer to
 * "show me the writing" when there is none.
 *
 * The alternative, a page that says "posts coming soon", is a page whose whole
 * content is a promise. That is worth less than nothing to a reader and less
 * than that to a reviewer.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Blog · ${SITE_NAME}`,
  description: `Notes on building ${SITE_NAME} — the decisions, the level design, and what went wrong.`,
  alternates: { canonical: `${SITE_URL}/blog` },
};

export default function BlogPage() {
  const posts = publishedPosts();
  if (posts.length === 0) notFound();

  return (
    <PageShell width="prose">
      <PageHeader title="Blog">
        <p className="text-dim text-sm">
          Notes on building {SITE_NAME} — what the decisions were, and what I
          got wrong.
        </p>
      </PageHeader>

      <ul className="flex flex-col gap-8">
        {posts.map((post) => (
          <li key={post.slug} className="flex flex-col gap-1.5">
            <h2 className="text-ink text-lg font-bold">
              <Link href={`/blog/${post.slug}`} className="hover:text-accent">
                {post.title}
              </Link>
            </h2>
            <time dateTime={post.date} className="hud-label num">
              {formatDate(post.date)}
            </time>
            <p className="text-dim text-sm leading-relaxed">{post.summary}</p>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
