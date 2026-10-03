import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Lilita_One, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RoomAuth } from "@/components/RoomAuth";
import { SiteNav, SiteTabBar } from "@/components/SiteNav";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { UiSounds } from "@/components/UiSounds";
import { InstallToast } from "@/components/InstallToast";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { StatsProvider } from "@/components/stats/StatsProvider";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { AD_CLIENT } from "@/lib/ads";
import { adLoaderScript } from "@/lib/ad-loader";
import { SITE_URL } from "@/lib/site";
// Counted from the registry rather than typed into the sentence: every one of
// these numbers had gone stale. See `content/registry.ts`.
import { COURSE_COUNT } from "@/content/registry";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { ClerkThemeSync } from "@/components/ClerkThemeSync";

/**
 * Three families, each with one job (Neon Drift direction, tokens.css).
 *
 * Lilita One is the game face: heavy, rounded and a little condensed — the
 * lettering of a game's title screen rather than of a dashboard. It is used
 * ONLY for headings, `.hud-label` and the text the cabinets draw on canvas
 * (`arcade/host/type.ts`, which reads `--font-game` off <html> for that), and
 * never as body copy, which is why the UI face below still exists.
 *
 * It replaced Orbitron, the techno face of the first "Neon Drift" pass. One
 * weight only: every rule that sets it says `font-weight: 400`, because a
 * synthesised bold over a display face is the tell of a web page dressed as
 * a game.
 */
const lilita = Lilita_One({
  variable: "--font-game",
  weight: "400",
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
  title: "Spec Driven Games",
  // Describes what the thing IS, not what the repo contains: the builder is
  // hidden in v1 (lib/features), and this string is what a search result and
  // an ad review both read.
  description:
    `A browser platformer. ${COURSE_COUNT} parkour courses, medals, ghosts and leaderboards — no download, no account needed to start.`,
  // Next serves app/manifest.ts at this path; naming it here is what puts the
  // <link rel="manifest"> in the document, which is what makes the app
  // installable and what PWABuilder reads to package the Android build.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Spec Driven Games",
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
      className={`${lilita.variable} ${plex.variable} ${jetbrains.variable} h-full antialiased`}
      // The theme script below writes `data-theme` before hydration; React
      // never renders it, so this is the one attribute it is told to expect.
      suppressHydrationWarning
    >
      {/*
        The theme, before the first paint. A plain inline script rather than
        next/script: it must block, because the whole point is that the page
        never paints in the wrong theme. See lib/theme.ts.

        Inside an explicit <head>, not loose under <html>: React hoists an
        `async` script (AdSense, below) wherever it is written, but a
        blocking one it has to leave where it is, and a <script> as a child
        of <html> is a hydration error.
      */}
      <head>
        {/* suppressHydrationWarning: AdSense inserts its own script at the
            top of <head> before React hydrates, and React then pairs this
            element with that one and reports the difference. This script has
            already run by then; nothing about it needs reconciling. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/*
          AdSense — loaded by an inline script that first checks it is not
          inside one of the Android apps (lib/ad-loader.ts). Still in the
          served <head>, so it starts as early as the bare tag it replaced.
          Outside production it asks for Google's test ads, so the rewarded
          and interstitial flows (lib/game-ads.ts) can be exercised locally
          without serving real impressions.
        */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: adLoaderScript(process.env.NODE_ENV !== "production") }}
        />
      </head>

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
          {/* Renders nothing: gives Clerk's modal the light palette on a
              light page. See the component for why it is not the prop. */}
          <ClerkThemeSync />
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
              <span className="truncate text-sm font-semibold">Spec Driven Games</span>
            </Link>
            {/* Two layouts, not one squeezed: see components/SiteNav. */}
            <SiteNav />
          </header>
          <AppUpdateNotice />
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
            {/* Renders nothing of its own. Every `<StatBadge>` below it
                registers its slug on mount and one request goes out for the
                whole page — thirty cards, one round trip. At the layout level
                rather than per page so a badge can be put on any card
                anywhere without first arranging a provider for it. */}
            <StatsProvider>{children}</StatsProvider>
          </main>
          {/* Phones only; the destinations under the thumb. See SiteNav. */}
          <SiteTabBar />
          {/* The one popup the site has: install, offered once somebody has
              played something. See the component for when it may appear. */}
          <InstallToast />
        </ClerkProvider>
        {/* Vercel Speed Insights: Core Web Vitals from real visits, reported
            to the project's dashboard. A no-op in `next dev` and off Vercel,
            and it must not go inside ClerkProvider — it has nothing to do with
            a session and should load whether or not one exists. */}
        <SpeedInsights />
      </body>
    </html>
  );
}