import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Orbitron, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { RoomAuth } from "@/components/RoomAuth";
import { SiteNav } from "@/components/SiteNav";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { UiSounds } from "@/components/UiSounds";
import { InstallToast } from "@/components/InstallToast";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { AD_CLIENT } from "@/lib/ads";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

/**
 * Three families, each with one job (Neon Drift direction, tokens.css).
 *
 * Orbitron is the techno display face: wide, geometric, and the thing that
 * makes a heading or a HUD legend read as instrumentation. It is used ONLY
 * for headings and `.hud-label` — it is genuinely unreadable as body copy,
 * which is why the UI face below still exists.
 */
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  display: "swap",
});

/**
 * IBM Plex Sans is drafting-table utilitarian, excellent at small sizes, and
 * its numerals are unambiguous — which matters for coordinates and block
 * counts read at a glance.
 */
const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * JetBrains Mono carries every number in the app — speed, splits, lap times,
 * coordinates. Chosen over Plex Mono for its taller x-height and its clearly
 * disambiguated 0/O and 1/l, which is what a readout glanced at from a moving
 * bike actually needs.
 */
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  // Without this, Next resolves every relative Open Graph and Twitter URL
  // against localhost:3000 — so a shared link gets no preview image and the
  // failure is invisible from inside the app.
  metadataBase: new URL(SITE_URL),
  title: "Blockworld",
  // Describes what the thing IS, not what the repo contains: the builder is
  // hidden in v1 (lib/features), and this string is what a search result and
  // an ad review both read.
  description:
    "A browser platformer. Twenty parkour courses, medals, ghosts and leaderboards — no download, no account needed to start.",
  // Next serves app/manifest.ts at this path; naming it here is what puts the
  // <link rel="manifest"> in the document, which is what makes the app
  // installable and what PWABuilder reads to package the Android build.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Blockworld",
    // Safari ignores the manifest entirely, so the installed-app appearance has
    // to be declared again here.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // AdSense ownership, third of three, and the only one that was missing.
  //
  // The loader <script> below proves ads can serve and public/ads.txt proves
  // Google is authorised to sell — but neither satisfies the console's "Meta
  // tag" verification option, which greps the raw HTML of the site root for
  // this exact name and nothing else. Declared here rather than written by
  // hand so it renders into the server HTML; a client-injected tag is not
  // there when the verifier fetches the page.
  other: {
    "google-adsense-account": AD_CLIENT,
  },
};

/**
 * Split out of `metadata` because Next requires it to be: `themeColor` and
 * `viewport` moved to their own export, and leaving them above is a build-time
 * warning rather than an error, so it goes unnoticed.
 *
 * `viewportFit: "cover"` lets a fullscreen install paint under a phone's
 * rounded corners and notch instead of letterboxing the canvas.
 */
export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${orbitron.variable} ${plex.variable} ${jetbrains.variable} h-full antialiased`}
    >
      {/*
        AdSense, and why it is a bare <script> rather than next/script.

        React 19 hoists an `async` script into <head> and dedupes it by `src`,
        so this lands in the server-rendered HTML head — which is what AdSense
        actually wants: Auto Ads and the site-verification crawler both read
        the document they are served, and `next/script`'s afterInteractive
        strategy injects from the client after hydration, where a crawler
        fetching raw HTML will not see it.

        `crossOrigin="anonymous"` is Google's own snippet, not a guess: without
        it the script is opaque to the page and ad errors surface as unhelpful
        script errors.
      */}
      <script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`}
        crossOrigin="anonymous"
      />
      {/*
        `h-dvh` (not `min-h-full`) is deliberate: the R3F <Canvas> sizes itself
        to height:100% of its parent, which only resolves if every ancestor has
        a *definite* height. A min-height chain leaves the canvas collapsed to a
        thin strip. The shell owns the viewport; <main> owns the scrolling.
      */}
      <body className="flex h-dvh flex-col overflow-hidden">
        {/* The palette Clerk's own tree renders in. See lib/clerk-appearance
            for why it is a restatement of tokens.css rather than a reference
            to it, and for the two seeds whose absence made the primary button
            and the Google button unreadable. */}
        <ClerkProvider appearance={clerkAppearance}>
          {/* Renders nothing; it is how a room join gets a Clerk token. */}
          <RoomAuth />
          {/* Also renders nothing. Production only — see the component. */}
          <ServiceWorkerRegistrar />
          {/* Renders nothing: every control on the site gets a press, a
              confirm and a hover cue from one delegated listener. */}
          <UiSounds />
          {/* `relative` is what the mobile menu panel anchors to: it opens
              full-width under the header rather than under the 28px button
              that toggles it. `min-w-0` lets the wordmark truncate instead of
              pushing the nav off the screen on a very narrow phone. */}
          <header className="site-header border-[var(--border-color)] bg-surface relative flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 sm:px-6">
            <Link href="/" className="group flex min-w-0 items-center gap-2.5">
              {/* A single accent block, rotated to read as a voxel corner —
                  and lit, because in the Neon Drift direction the mark is the
                  one place on the page chrome allowed to glow. */}
              <span
                className="bg-accent block h-4 w-4 shrink-0 rotate-45 transition-transform group-hover:rotate-[135deg]"
                style={{ boxShadow: "var(--glow-strong)" }}
              />
              <span className="truncate text-sm font-semibold">Blockworld</span>
            </Link>
            {/* Two layouts, not one squeezed: see components/SiteNav. */}
            <SiteNav />
          </header>
          {/* min-h-0 lets this actually shrink inside the flex column; without
              it a tall child would push the shell past the viewport.

              `overflow-x-hidden` is not belt-and-braces, it is the fix for a
              real rule: when one axis of `overflow` is `visible` and the other
              is not, CSS computes the `visible` one to `auto`. So
              `overflow-y-auto` alone silently made this horizontally
              scrollable, and anything a few pixels too wide — the old header
              row, a long heading — gave the whole site a sideways scrollbar
              rather than being clipped or wrapped. Stating both axes is what
              stops that. The causes are fixed too (see SiteNav and the
              typography below); this is the floor under them. */}
          <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {children}
          </main>
          {/* The one popup the site has: install, offered once somebody has
              played something. See the component for when it may appear. */}
          <InstallToast />
        </ClerkProvider>
      </body>
    </html>
  );
}