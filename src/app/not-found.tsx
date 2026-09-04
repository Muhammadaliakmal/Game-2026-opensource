import Link from "next/link";

/**
 * Replaces Next's default 404, which is an unstyled white page — jarring after
 * a dark game, and it gives no way back into the app.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <span className="hud-label text-accent">404</span>
      <h1 className="text-3xl font-black tracking-tight">
        There is nothing here
      </h1>
      <p className="text-dim max-w-sm text-sm">
        That link points at a world that does not exist, or one that has not
        been published.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="hud-chip hud-chip--primary">
          Your worlds
        </Link>
        <Link href="/browse" className="hud-chip">
          Browse worlds
        </Link>
      </div>
    </div>
  );
}
