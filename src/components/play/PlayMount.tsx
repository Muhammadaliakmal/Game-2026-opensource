"use client";

import dynamic from "next/dynamic";

/**
 * Client-side mount point for the Play canvas.
 *
 * Same reason as EditorMount: `next/dynamic` with `ssr: false` is only legal in
 * a Client Component, so the page stays a Server Component (to await `params`)
 * and hands the browser-only R3F mount to this file.
 */
const PlayCanvas = dynamic(() => import("./PlayCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center gap-3 bg-zinc-950 text-sm text-zinc-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
      Loading…
    </div>
  ),
});

export function PlayMount({ worldId }: { worldId: string }) {
  return <PlayCanvas worldId={worldId} />;
}
