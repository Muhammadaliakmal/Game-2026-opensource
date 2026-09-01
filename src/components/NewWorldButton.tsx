"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewWorldButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled World" }),
      });
      if (!res.ok) throw new Error(`Could not create world (${res.status})`);
      const row = await res.json();
      router.push(`/build/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create world");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={create}
        disabled={creating}
        className="hud-chip hud-chip--neon !px-5 !py-3"
      >
        {creating ? "Creating…" : "+ New World"}
      </button>
      {error && <p className="text-flare text-sm">{error}</p>}
    </div>
  );
}
