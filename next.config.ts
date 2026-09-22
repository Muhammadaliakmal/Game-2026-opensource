import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `/privacy-policy` is where people look, `/privacy` is where it is.
   *
   * The policy has lived at `/privacy` since it was written, and that is the
   * URL in the sitemap and the footer. But it is also the URL that has to be
   * typed into an AdSense application by hand, and the spelled-out form is
   * what most sites use and therefore what a reviewer guesses. A permanent
   * redirect costs one line and removes a 404 that would arrive with no
   * explanation attached.
   */
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/terms-of-use", destination: "/terms", permanent: true },
    ];
  },

  /**
   * Digital Asset Links, at the one path Android will look for it.
   *
   * The handler lives at `app/well-known/assetlinks.json/route.ts` because a
   * directory whose name starts with a dot is not a route segment the App
   * Router will pick up. This maps the real URL onto it.
   *
   * It must be a **rewrite and not a redirect**, and that is the whole point
   * of the entry: Android's asset-link verifier does not follow a 301 or a
   * 308. It asks for `/.well-known/assetlinks.json`, and if what comes back is
   * a redirect it gives up and the app opens with a browser address bar
   * pinned over the HUD. A rewrite is resolved inside the server, so the
   * verifier gets its 200 at the URL it asked for. See the route for the rest
   * of what that file has to satisfy.
   */
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/well-known/assetlinks.json",
      },
    ];
  },

  /**
   * Static file headers.
   *
   * The APK is served from `public/blockworld.apk` with the MIME type that
   * browsers and phones recognize as an Android package.
   */
  async headers() {
    return [
      {
        source: "/blockworld.apk",
        headers: [
          {
            key: "Content-Type",
            value: "application/vnd.android.package-archive",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
