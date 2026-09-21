import { ANDROID_PACKAGE_ID, androidFingerprints } from "@/lib/android";

/**
 * Digital Asset Links, served at `/.well-known/assetlinks.json`.
 *
 * This file is what proves that specdrivengames.com and the Android app are
 * the same owner. Android's verifier fetches it when the app is installed;
 * if it does not get a clean answer the TWA still runs, but **with a browser
 * address bar pinned across the top**, which on a phone eats the strip of
 * canvas the race HUD's running order sits in.
 *
 * ── Why a route and not `public/.well-known/assetlinks.json` ─────────────
 *
 * A static file would be simpler and is the usual advice. It is wrong here
 * for one reason: the fingerprints are not known at the same time. The
 * sideload key exists before launch, the Play app signing key only after the
 * first bundle is uploaded. A static file makes that second value a code
 * change and a deploy; this makes it an environment variable. See lib/android.
 *
 * The route lives at `/well-known/...` and is rewritten from `/.well-known/...`
 * in next.config.ts. A leading-dot directory is not a segment name the App
 * Router is willing to treat as a route, and a *rewrite* rather than a
 * redirect is load-bearing — see below.
 *
 * ── The three things the verifier requires ───────────────────────────────
 *
 * 1. **HTTPS.** Handled by the host.
 * 2. **HTTP 200 with `Content-Type: application/json`.** Returned explicitly
 *    below rather than via `Response.json`, which is right anyway but would
 *    leave the header an implementation detail of the runtime.
 * 3. **No redirects.** Android's verifier does not follow a 301 or a 302.
 *    This is why the mapping in next.config.ts is a rewrite: a rewrite is
 *    resolved inside the server and the verifier sees 200 at the URL it
 *    asked for, where a redirect would hand it a 308 and it would stop.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const fingerprints = androidFingerprints();

  const body = [
    {
      relation: [
        // Both, deliberately. `handle_all_urls` is what a TWA checks to decide
        // whether to drop the address bar; `get_login_creds` costs nothing and
        // is what lets a password manager treat the app and the site as one
        // origin, which matters because sign-in here is Clerk's hosted flow.
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      /*
       * Five minutes, not a day.
       *
       * The verifier re-checks this file, and the moment it matters most is
       * the moment a fingerprint has just been added — the first Play release,
       * or a re-signing. A long cache there means installs keep failing
       * verification against a copy of the file that predates the fix, with no
       * signal that anything is stale. Five minutes is long enough that this
       * is not a hot path and short enough that a correction lands the same
       * afternoon.
       */
      "Cache-Control": "public, max-age=300",
    },
  });
}
