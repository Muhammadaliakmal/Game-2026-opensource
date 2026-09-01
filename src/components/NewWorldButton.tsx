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
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={create}
        disabled={creating}
        className="rounded-full bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {creating ? "Creating…" : "New World"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
