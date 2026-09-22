"use client";

import { useEffect } from "react";

/**
 * Tries the handoff once on arrival, and always offers the button: Chrome
 * may refuse to open an app without a tap, and the tap is the reliable path.
 */
export function ReturnToApp({ href }: { href: string }) {
  useEffect(() => {
    window.location.href = href;
  }, [href]);

  return (
    <section className="card flex flex-col gap-3 p-5">
      <a href={href} className="hud-chip hud-chip--primary w-fit">
        Open Spec Driven Games
      </a>
      <p className="text-dim text-xs">
        The link works once and expires in two minutes.
      </p>
    </section>
  );
}
