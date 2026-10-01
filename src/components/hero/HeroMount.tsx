"use client";

import dynamic from "next/dynamic";
import { HeroSky } from "./HeroSky";

/**
 * Browser-only mount for the landing hero.
 *
 * Same reason as EditorMount and PlayMount: `next/dynamic` with `ssr: false`
 * is only legal inside a Client Component. It matters more here than
 * elsewhere, though — this is a marketing page, and three.js has no business
 * blocking its first paint. The placeholder holds the layout so the page does
 * not jump when the canvas arrives, and it is the same sky the canvas is
 * drawn over, so the hand-off is the island appearing and nothing else.
 */
const HeroCanvas = dynamic(() => import("./HeroCanvas"), {
  ssr: false,
  loading: () => (
    <div className="hero-sky flex h-[55dvh] max-h-[34rem] min-h-[min(20rem,55dvh)] w-full items-center justify-center">
      <HeroSky />
      <span className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  ),
});

export function HeroMount() {
  return <HeroCanvas />;
}
