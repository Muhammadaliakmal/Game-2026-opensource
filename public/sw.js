/**
 * Spec Driven Games' service worker.
 *
 * Two jobs, in this order of importance:
 *
 * 1. Exist, with a `fetch` handler. Chrome will not offer "Install app" without
 *    one, and PWABuilder will not package an Android app without installability.
 *    Everything below could be a pass-through and the APK would still build.
 * 2. Stop re-downloading things that cannot change. A world is a few hundred
 *    kilobytes of JSON; the prop models next to it are megabytes of glTF, and
 *    on a phone on mobile data they were being fetched again on every visit.
 *
 * ── What is deliberately NOT cached ──────────────────────────────────────
 *
 * Almost everything. This is an allowlist, not a denylist, because the failure
 * mode of over-caching here is not a stale page — it is a wrong one:
 *
 * - **Navigations (HTML).** Clerk renders session state into the document. A
 *   cached page therefore has somebody's sign-in state baked into it, and
 *   serving that from a cache is how one person's header ends up in front of
 *   another. Always network.
 * - **The API, `/api/`.** Worlds are edited. A cached PUT response or a stale world list
 *   is a correctness bug, not a performance win.
 * - **Anything that is not a GET**, and anything cross-origin. Clerk, Neon and
 *   the room server all live off-origin and all of them are stateful.
 * - **WebSockets.** They do not go through `fetch` at all, so the room
 *   connection is untouched by anything here — worth stating, because it is
 *   the first thing people assume a service worker breaks.
 *
 * ── What IS cached ───────────────────────────────────────────────────────
 *
 * Only content-addressed or genuinely immutable assets: Next's fingerprinted
 * build output, the icons, and the prop and character models. Each of those
 * either has a hash
 * in its URL or is a file that would be given a new name if it changed.
 */

/**
 * Bump to retire every previous cache. The install/activate pair below deletes
 * anything whose name does not match, so this is the only lever needed.
 */
const VERSION = "v1";
const IMMUTABLE = `blockworld-immutable-${VERSION}`;
const OFFLINE = `blockworld-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/** Same-origin path prefixes whose contents never change under a given URL. */
const IMMUTABLE_PREFIXES = ["/_next/static/", "/icons/", "/props/", "/characters/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      // Take over on the next load rather than waiting for every tab holding
      // the old worker to close. Safe here because the worker owns no state
      // that a page could be halfway through using.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([IMMUTABLE, OFFLINE]);
      const names = await caches.keys();
      await Promise.all(names.map((n) => (keep.has(n) ? null : caches.delete(n))));
      await self.clients.claim();
    })()
  );
});

/** Is this a URL we are willing to keep a copy of? */
function isImmutable(url) {
  return (
    url.origin === self.location.origin &&
    IMMUTABLE_PREFIXES.some((p) => url.pathname.startsWith(p))
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Not a GET, or not ours: hand it straight to the network and forget it. No
  // `respondWith` at all, so the browser handles it exactly as it would with no
  // service worker installed.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network, with the offline card as the last resort. Never a
  // cached copy of a real page — see the header of this file.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(OFFLINE);
          const fallback = await cache.match(OFFLINE_URL);
          return (
            fallback ??
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  if (!isImmutable(url)) return;

  // Cache-first, because the URL is a promise that the bytes will not change.
  event.respondWith(
    (async () => {
      const cache = await caches.open(IMMUTABLE);
      const hit = await cache.match(req);
      if (hit) return hit;

      const res = await fetch(req);
      // Only store a real, complete response. An opaque or errored one cached
      // here would be served forever as if it were the asset.
      if (res.ok && res.status === 200 && res.type === "basic") {
        cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
