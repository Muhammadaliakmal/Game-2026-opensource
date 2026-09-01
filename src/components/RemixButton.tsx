"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Copies a built-in world into a row the player owns, then opens it in the
 * editor.
 *
 * Built-in worlds are generated and read-only, so this is the only path to
 * editing one — and it's also the cheapest possible version of the remix loop
 * SPEC §9 #4 calls the strongest UGC retention driver.
 */
export function RemixButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remix() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: slug }),
      });
      if (!res.ok) throw new Error(`Could not remix (${res.status})`);
      const row = await res.json();
      router.push(`/build/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remix");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={remix}
        disabled={busy}
        className="hud-chip"
        title={`Make an editable copy of ${name}`}
      >
        {busy ? "Copying…" : "⎘ Remix"}
      </button>
      {error && <p className="text-flare w-full text-xs">{error}</p>}
    </>
  );
}
