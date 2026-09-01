"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Without this, a failed server render (the database unreachable, say) shows
 * Next's default error screen with no way back. `reset()` re-renders the
 * segment, which is enough to recover from a transient failure without a full
 * page load.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack in production.
    console.error("[blockworld]", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <span className="hud-label text-danger">Something broke</span>
      <h1 className="text-3xl font-black tracking-tight">
        That did not load
      </h1>
      <p className="text-steel-200 max-w-sm text-sm">
        Try again — and if it keeps happening, the problem is on our side, not
        in your world. Nothing you have saved is affected.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={reset} className="hud-chip hud-chip--primary">
          Try again
        </button>
        <Link href="/" className="hud-chip">
          Your worlds
        </Link>
      </div>
      {error.digest && (
        <p className="text-steel-500 font-mono text-[0.625rem]">
          reference {error.digest}
        </p>
      )}
    </div>
  );
}
