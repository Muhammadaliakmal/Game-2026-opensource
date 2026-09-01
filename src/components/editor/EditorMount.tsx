"use client";

import dynamic from "next/dynamic";

/**
 * Client-side mount point for the editor canvas.
 *
 * This wrapper exists because `next/dynamic` with `ssr: false` is only legal
 * inside a Client Component — calling it from the Server Component page is a
 * build error. The page stays a Server Component (so it can await `params`)
 * and delegates the browser-only mount to this file.
 */
const EditorCanvas = dynamic(() => import("./EditorCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center gap-3 bg-zinc-950 text-sm text-zinc-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
      Loading editor…
    </div>
  ),
});

export function EditorMount({ worldId }: { worldId: string }) {
  return <EditorCanvas worldId={worldId} />;
}
