import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Orbitron, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { RoomAuth } from "@/components/RoomAuth";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
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
        <ClerkProvider
          appearance={{
            variables: {
              // Clerk renders in its own tree and cannot read our CSS
              // variables, so the palette is restated here. These are the
              // literal values of --color-accent (cyan, the neutral default;
              // Clerk's modal is not inside any mode), --color-panel,
              // --color-ink, --color-dim and --color-danger.
              colorPrimary: "#00fff5",
              colorBackground: "#16161f",
              colorForeground: "#eef1ff",
              colorMutedForeground: "#a3a8c8",
              colorDanger: "#ff3b30",
              borderRadius: "3px",
            },
          }}
        >
          {/* Renders nothing; it is how a room join gets a Clerk token. */}
          <RoomAuth />
          {/* Also renders nothing. Production only — see the component. */}
          <ServiceWorkerRegistrar />
          <header className="border-[var(--border-color)] bg-surface flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              {/* A single accent block, rotated to read as a voxel corner —
                  and lit, because in the Neon Drift direction the mark is the
                  one place on the page chrome allowed to glow. */}
              <span
                className="bg-accent block h-4 w-4 rotate-45 transition-transform group-hover:rotate-[135deg]"
                style={{ boxShadow: "var(--glow-strong)" }}
              />
              <span className="text-sm font-semibold">Blockworld</span>
            </Link>
            <div className="flex items-center gap-3">
              {/* An explicit way home, next to the other destinations.
                  The wordmark on the left has always linked here, but a logo is
                  something people read rather than something they press — in a
                  race, on a phone, with the HUD over the canvas, nobody found
                  it. The icon carries it on the narrowest screens; the label
                  appears as soon as there is room for it. */}
              <Link href="/" className="hud-chip" aria-label="Home">
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 6.8 8 2l6 4.8" />
                  <path d="M3.6 7.8V13a.8.8 0 0 0 .8.8h7.2a.8.8 0 0 0 .8-.8V7.8" />
                  <path d="M6.4 13.8V9.6h3.2v4.2" />
                </svg>
                <span className="hidden sm:inline">Home</span>
              </Link>
              {/* Reachable on a phone too: this used to be `hidden sm:inline-flex`,
                  which left mobile visitors with no route to the gallery at all. */}
              <Link href="/browse" className="hud-chip">
                Browse
              </Link>
              {/* Racing is NOT a chip here any more. It was, because it was
                  otherwise reachable only by typing the URL — but a five-word
                  link wedged between "Browse" and "Get the app" is not how
                  anybody finds a game mode, and it competed with the header's
                  actual job. It is a cover on the home page now, next to
                  parkour, which is where someone looking for something to play
                  is already looking. */}
              {/* Hidden on the narrowest screens: the header wraps behind the
                  sign-in buttons otherwise. Anyone on a phone who wants this is
                  being sent a link to it. */}
              <Link href="/download" className="hud-chip hidden sm:inline-flex">
                Get the app
              </Link>
              <Show when="signed-out">
                {/* Modal, not a page: UI spec §3.5 — signing in must not take
                    someone away from the world they are in the middle of
                    building. */}
                <SignInButton mode="modal" />
                <SignUpButton mode="modal" />
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          {/* min-h-0 lets this actually shrink inside the flex column; without
              it a tall child would push the shell past the viewport. */}
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}