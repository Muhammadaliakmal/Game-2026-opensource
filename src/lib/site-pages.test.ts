import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { POSTS, hasPosts, postBody, publishedPosts } from "./blog";
import { footerLinks } from "./site-links";
import { SITE_URL } from "./site";
import sitemap from "@/app/sitemap";

/**
 * The publisher pages, and the links that have to reach them.
 *
 * ── Why a test and not a checklist ───────────────────────────────────────
 *
 * "Footer links appear on every page and none 404" is the kind of item that
 * is true on the day it is ticked and silently false a month later, because
 * nothing about renaming a route tells the footer. The failure is invisible
 * in development — you do not click your own privacy policy — and it lands on
 * the one visitor who matters, which is whoever is deciding whether this site
 * has a publisher behind it.
 *
 * So the route table is checked against the filesystem. It is not a
 * substitute for loading the pages in production, which is a different claim;
 * it is the half that can be automated, and the half that regresses.
 */

const APP = join(process.cwd(), "src", "app");

/**
 * Whether a URL path has a page in the App Router.
 *
 * Walks the segments, preferring an exact directory and falling back to a
 * dynamic one — `[slug]`, `[id]`, `[[...sign-in]]` — so `/play/tower` resolves
 * through `play/[id]` exactly as Next would.
 */
function routeExists(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  let dir = APP;

  for (const segment of segments) {
    const exact = join(dir, segment);
    if (existsSync(exact)) {
      dir = exact;
      continue;
    }
    const dynamic = readdirSync(dir, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && entry.name.startsWith("[")
    );
    if (!dynamic) return false;
    dir = join(dir, dynamic.name);
  }

  return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "page.ts"));
}

test("the route walker can tell a real page from a missing one", () => {
  // The test's own instrument, checked first: a walker that returned true for
  // everything would make every assertion below vacuous.
  assert.ok(routeExists("/"), "the home page");
  assert.ok(routeExists("/privacy"), "a page that exists");
  assert.ok(routeExists("/play/anything"), "resolved through play/[id]");
  assert.equal(routeExists("/not-a-page"), false);
  assert.equal(routeExists("/privacy/deeper"), false);
});

test("every footer link goes somewhere", () => {
  for (const link of footerLinks()) {
    assert.ok(routeExists(link.href), `footer link ${link.href} has no page`);
    assert.ok(link.label.trim().length > 0, `${link.href} has no label`);
  }
});

test("the four pages a publisher review looks for are all linked", () => {
  // About, Contact, Privacy, Terms. Not a style preference: these are what an
  // ad review checks for, and it checks for them in the footer.
  const hrefs = footerLinks().map((l) => l.href);
  for (const required of ["/about", "/contact", "/privacy", "/terms"]) {
    assert.ok(hrefs.includes(required), `${required} is not in the footer`);
  }
});

test("everything in the sitemap is a page that exists", () => {
  const entries = sitemap();
  assert.ok(entries.length > 5, "a sitemap this short is a bug");

  for (const entry of entries) {
    assert.ok(
      entry.url.startsWith(SITE_URL),
      `${entry.url} is not on this site`
    );
    const path = entry.url.slice(SITE_URL.length) || "/";
    assert.ok(routeExists(path), `sitemap lists ${path}, which has no page`);
  }
});

test("the sitemap does not promise a crawler anything private", () => {
  // `robots.ts` disallows these, and a sitemap that lists what robots.txt
  // forbids is a contradiction a crawler resolves by trusting neither.
  const paths = sitemap().map((e) => e.url.slice(SITE_URL.length));
  for (const path of paths) {
    assert.ok(!path.startsWith("/api/"), `${path} is an API route`);
    assert.ok(!path.startsWith("/build"), `${path} needs a session`);
  }
});

// ── The blog, which is mostly a question of what is NOT shipped ──────────

test("a published post has a date, a summary and words", () => {
  for (const post of publishedPosts()) {
    assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/, `${post.slug} has no date`);
    assert.ok(post.summary.trim().length > 0, `${post.slug} has no summary`);
    // The one that catches the real mistake: flipping `status` without
    // writing the file leaves a link on the index that 404s.
    assert.ok(postBody(post.slug), `${post.slug} is published with no body`);
  }
});

test("a planned post is not routed, listed, or promised", () => {
  const planned = POSTS.filter((p) => p.status === "planned");
  const listed = publishedPosts().map((p) => p.slug);
  const inSitemap = sitemap().map((e) => e.url);

  for (const post of planned) {
    assert.ok(!listed.includes(post.slug), `${post.slug} is on the index`);
    assert.ok(
      !inSitemap.includes(`${SITE_URL}/blog/${post.slug}`),
      `${post.slug} is promised to a crawler`
    );
  }
});

test("the blog is linked exactly when there is a blog", () => {
  // One fact, three readers — the footer, the sitemap and the About page. The
  // point of `hasPosts()` is that they cannot disagree, and this is what says
  // so if somebody adds a fourth reader with its own idea.
  const linked = footerLinks().some((l) => l.href === "/blog");
  const inSitemap = sitemap().some((e) => e.url === `${SITE_URL}/blog`);
  assert.equal(linked, hasPosts(), "footer and blog state disagree");
  assert.equal(inSitemap, hasPosts(), "sitemap and blog state disagree");
});

test("post slugs are unique and URL-shaped", () => {
  const slugs = POSTS.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, "two posts share a slug");
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${slug} is not a slug`);
  }
});
