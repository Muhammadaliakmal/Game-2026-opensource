import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_SHORT_NAME } from "@/lib/site";
import { RACE } from "@/lib/features";

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * A route rather than a static `public/manifest.json` so it is typed and cannot
 * drift from the metadata in layout.tsx without TypeScript noticing.
 *
 * This file is also the input to the Android build: PWABuilder reads it from
 * the deployed URL and turns it into a Trusted Web Activity APK, so several
 * fields below are load-bearing rather than decorative.
 *
 * - `display: "fullscreen"` — this is a game, and on a phone the browser's own
 *   chrome eats the top of a canvas that is already sized to the viewport.
 *   "standalone" would leave a status bar over the HUD.
 * - `orientation: "landscape"` — the race HUD puts the running order top-right,
 *   lap and position down the left, and the touch controls in both bottom
 *   corners. In portrait those overlap the middle of the track.
 * - `id` — the stable identity of the installed app. Omit it and the identity
 *   falls back to `start_url`, so changing the start URL later would install a
 *   *second* app alongside the first rather than updating it.
 * - `icons` — a maskable entry is required for a launcher icon that is not
 *   letterboxed inside a white rounded square on Android 8+. See
 *   scripts/generate-icons.ts for why it is a separate image.
 * - `short_name` is the home-screen label and is NOT the full name. A launcher
 *   truncates rather than wraps, so the long one arrives as an ellipsis under
 *   the icon. Both come from `lib/site.ts` so the name lives in one place.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    short_name: SITE_SHORT_NAME,
    description:
      "Build 3D worlds out of blocks, then play and race through them with other people.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    // Honoured by browsers that do not support fullscreen for an installed app;
    // without it those fall all the way back to a normal browser tab.
    display_override: ["fullscreen", "standalone"],
    orientation: "landscape",
    background_color: "#1a1d21",
    theme_color: "#1a1d21",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the launcher icon. Cheap to offer and it skips the lobby.
    shortcuts: [
      ...(RACE
        ? [
            {
              name: "Race",
              short_name: "Race",
              url: "/race",
              description: "Open a grid or join one with a code",
            },
          ]
        : []),
      {
        name: "Browse worlds",
        short_name: "Browse",
        url: "/browse",
        description: "Worlds other people have built",
      },
    ],
  };
}
