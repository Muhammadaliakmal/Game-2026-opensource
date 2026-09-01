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
    <div className="bg-steel-900 flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <span className="border-signal h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      Loading…
    </div>
  ),
});

export function PlayMount({ worldId }: { worldId: string }) {
  return <PlayCanvas worldId={worldId} />;
}
