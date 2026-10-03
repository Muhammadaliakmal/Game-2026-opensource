import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

/**
 * Only the routes that ask Clerk who is calling, on the server.
 *
 * This used to be Clerk's catch-all — every page except static files — and
 * that was the single most expensive line on the site. Clerk's middleware
 * answers a browser's first visit with a 307 to its own handshake endpoint
 * and back (`dev-browser-missing` on a development instance, which is what
 * production runs today), so *every* page, including ones served straight
 * from Vercel's edge cache like `/blog`, waited for two extra round trips to
 * a US host before any HTML was sent. Real visitors measured a p75 TTFB of
 * four seconds, eight from Pakistan.
 *
 * A page that never calls `auth()` gains nothing from the middleware: the
 * header's sign-in state, the shop and the account menu are all Clerk's
 * client SDK, which keeps its own session. So the list is the code that
 * does call it:
 *
 * - `/api/*` — the routes that read the session (`auth()` in a route
 *   handler throws without the middleware). Fetches, not navigations, so
 *   they never take the handshake redirect.
 * - `/app-auth/complete` — the one page that calls `auth()`.
 * - `/sign-in`, `/sign-up` — Clerk's own pages; it expects to see them.
 * - `/__clerk/*` — Clerk's proxy path.
 *
 * **Adding `auth()` or `currentUser()` to a page means adding it here**, or
 * the page throws "clerkMiddleware() was not run". `/` is the one to watch:
 * it calls `auth()` only while `UGC` is on (see app/page.tsx).
 *
 * Still excluded by not being listed: `/.well-known/assetlinks.json`, which
 * Android's verifier fetches without following redirects, and `ads.txt` /
 * `robots.txt`, which Google's crawlers fetch with no session to attach.
 */
export const config = {
  matcher: [
    "/(api|trpc)(.*)",
    "/app-auth/complete",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/__clerk/:path*",
  ],
};
