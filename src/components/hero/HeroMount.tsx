"use client";

import dynamic from "next/dynamic";

/**
 * Browser-only mount for the landing hero.
 *
 * Same reason as EditorMount and PlayMount: `next/dynamic` with `ssr: false`
 * is only legal inside a Client Component. It matters more here than
 * elsewhere, though — this is a marketing page, and three.js has no business
 * blocking its first paint. The placeholder holds the layout so the page does
 * not jump when the canvas arrives.
 */
const HeroCanvas = dynamic(() => import("./HeroCanvas"), {
  ssr: false,
  loading: () => (
    <div className="bg-steel-900 flex h-[55vh] min-h-[20rem] w-full items-center justify-center">
      <span className="border-signal h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  ),
});

export function HeroMount() {
  return <HeroCanvas />;
}
