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
    <div className="bg-steel-900 flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <span className="border-signal h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      Loading editor…
    </div>
  ),
});

export function EditorMount({ worldId }: { worldId: string }) {
  return <EditorCanvas worldId={worldId} />;
}
