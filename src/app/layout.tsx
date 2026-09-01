import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blockworld",
  description: "A UGC 3D world builder",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        `h-dvh` (not `min-h-full`) is deliberate: the R3F <Canvas> sizes itself
        to height:100% of its parent, which only resolves if every ancestor has
        a *definite* height. A min-height chain leaves the canvas collapsed to a
        thin strip. The shell owns the viewport; <main> owns the scrolling.
      */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <ClerkProvider>
          <header className="border-line bg-panel/60 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 backdrop-blur sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              {/* A little isometric mark — three faces of a voxel. */}
              <span className="from-neon to-plasma block h-6 w-6 rotate-45 rounded-[7px] bg-gradient-to-br shadow-[0_0_18px_-4px_var(--color-neon)] transition-transform group-hover:rotate-[135deg]" />
              <span className="text-sm font-bold tracking-[0.16em] uppercase">
                Blockworld
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton />
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