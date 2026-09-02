import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two families, clearly distinct (UI spec §1).
 *
 * Bricolage Grotesque has actual character — irregular widths and a slightly
 * built quality that suits a block editor — and it is variable, so headline
 * weights come from one file rather than three.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
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

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Blockworld",
  description: "A UGC 3D world builder",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${plex.variable} ${plexMono.variable} h-full antialiased`}
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
              colorPrimary: "#ffb020",
              colorBackground: "#2b3037",
              colorForeground: "#edf0f3",
              colorMutedForeground: "#c3c9d0",
              colorDanger: "#e5484d",
              borderRadius: "3px",
            },
          }}
        >
          <header className="border-[var(--border-color)] bg-steel-800 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              {/* A single amber block, rotated to read as a voxel corner. The
                  old gradient mark was exactly the decorative chrome the design
                  direction rules out. */}
              <span className="bg-signal block h-4 w-4 rotate-45 transition-transform group-hover:rotate-[135deg]" />
              <span className="text-sm font-semibold">Blockworld</span>
            </Link>
            <div className="flex items-center gap-3">
              {/* Reachable on a phone too: this used to be `hidden sm:inline-flex`,
                  which left mobile visitors with no route to the gallery at all. */}
              <Link href="/browse" className="hud-chip">
                Browse
              </Link>
              {/* Racing was reachable only by typing the URL, which is the same
                  as not shipping it. Hidden on the narrowest screens so the
                  header does not wrap behind the sign-in buttons. */}
              <Link href="/race" className="hud-chip hidden xs:inline-flex sm:inline-flex">
                Race
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