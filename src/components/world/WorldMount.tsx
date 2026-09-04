"use client";

import dynamic from "next/dynamic";
import type { Mode } from "./WorldCanvas";

/**
 * Browser-only mount for the world canvas.
 *
 * `next/dynamic` with `ssr: false` is only legal inside a Client Component, so
 * the pages stay Server Components (they need to await `params`) and hand the
 * browser-only R3F mount to this file.
 */
const WorldCanvas = dynamic(() => import("./WorldCanvas"), {
  ssr: false,
  loading: () => (
    <div className="bg-base flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <span className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
      <span className="hud-label">Loading world</span>
    </div>
  ),
});

export function WorldMount({
  worldId,
  initialMode,
}: {
  worldId: string;
  initialMode: Mode;
}) {
  return <WorldCanvas worldId={worldId} initialMode={initialMode} />;
}
