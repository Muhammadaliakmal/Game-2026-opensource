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
};

export default nextConfig;
