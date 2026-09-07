import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Orbitron, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { RoomAuth } from "@/components/RoomAuth";
import { SiteNav } from "@/components/SiteNav";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { clerkAppearance } from "@/lib/clerk-appearance";
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
  title: "Blockworld",
  description: "A UGC 3D world builder",
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
        </ClerkProvider>
      </body>
    </html>
  );
}