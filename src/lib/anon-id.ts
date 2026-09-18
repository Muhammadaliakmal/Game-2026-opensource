/**
 * An anonymous id, in this browser and nowhere else.
 *
 * ── What it is for, and the line it must not cross ───────────────────────
 *
 * It exists to stop double-likes. That is the whole of it. The site's promise
 * is that nothing here needs an account, and a like button is not the thing to
 * break that promise for — so the identity behind a like is a UUID the browser
 * makes up about itself.
 *
 * It is never sent to analytics, never joined to a Clerk user id, and never
 * sent on a read. That last one is deliberate and worth stating: the batch
 * `GET /api/stats` could return "and here is what you have liked", and it
 * would then be sending a stable per-browser identifier on every page view,
 * which is the shape of the thing this is trying not to be. It would also buy
 * nothing — the id lives in this browser's localStorage, so a server round
 * trip could only ever tell this browser what it already knows. Liked state is
 * read from `lib/liked.ts` locally, and the id goes to the server only on the
 * one request that changes something.
 *
 * ── Why it is not "use client" ───────────────────────────────────────────
 *
 * The validator below runs on the server, in `POST /api/stats/like`. Marking
 * the module would make it unimportable there, and splitting it in two would
 * put the pattern a request is checked against in a different file from the
 * generator that has to satisfy it — which is how the two come to disagree.
 * The browser-only function guards on `window` instead.
 */

const KEY = "sdg_uid";

/**
 * A UUID as `crypto.randomUUID` produces one: version 4, RFC 4122 variant.
 *
 * Checked on the server because `anon_id` is half of a primary key, and an
 * unvalidated one is a column into which a caller can write any string they
 * like, as many times as they like. Narrow beats permissive here: this is the
 * only shape the app itself ever generates.
 */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isAnonId = (s: unknown): s is string =>
  typeof s === "string" && UUID_V4.test(s);

/**
 * This browser's id, generated on first use.
 *
 * Returns `""` on the server and in any browser where storage throws — a
 * private window, blocked site data, a page in a sandboxed frame. The caller
 * treats an empty id as "cannot like from here" and the heart is disabled
 * rather than the page being broken, which is the same degradation
 * `lib/last-played.ts` chose for the same reasons.
 *
 * `crypto.randomUUID` needs a secure context. Localhost and https both are;
 * anything else is already outside what this app supports (the service worker
 * and pointer lock need one too), but the try/catch means a missing one
 * disables the heart rather than throwing inside a render.
 */
export function getAnonId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(KEY);
    if (isAnonId(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "";
  }
}
