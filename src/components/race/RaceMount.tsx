"use client";

import dynamic from "next/dynamic";

/**
 * Browser-only mount for the race canvas — `ssr: false` is only legal inside a
 * Client Component, so the route stays a Server Component (it has to await
 * `params`) and hands the R3F tree to this file. Same split as ArenaMount.
 */
const RaceCanvas = dynamic(() => import("./RaceCanvas"), {
  ssr: false,
  loading: () => (
    <div className="bg-base flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <span className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
      <span className="hud-label">Loading race</span>
    </div>
  ),
});

export function RaceMount({ code }: { code: string }) {
  return <RaceCanvas code={code} />;
}
