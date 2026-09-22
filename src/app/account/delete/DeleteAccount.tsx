"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, useClerk } from "@clerk/nextjs";

type Phase = "idle" | "working" | "error";

export function DeleteAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <section className="card flex flex-col gap-3 p-5">
        <p className="text-dim text-xs">
          Sign in to the account you want to delete, and you will be brought
          back here.
        </p>
        <Link
          href="/sign-in?redirect_url=/account/delete"
          className="hud-chip hud-chip--primary w-fit"
        >
          Sign in
        </Link>
      </section>
    );
  }

  const onDelete = async () => {
    setPhase("working");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(body?.error ?? "Something went wrong. Try again.");
        setPhase("error");
        return;
      }
      // The session belongs to a user that no longer exists; drop it here
      // rather than leave the page holding a token for nobody.
      await signOut({ redirectUrl: "/" });
    } catch {
      setMessage("Could not reach the server. Try again.");
      setPhase("error");
    }
  };

  return (
    <section className="card border-accent/40 flex flex-col gap-4 p-5">
      <label className="text-dim flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        I understand this deletes my account and everything above, for good.
      </label>
      <button
        onClick={onDelete}
        disabled={!confirmed || phase === "working"}
        className="hud-chip hud-chip--primary w-fit disabled:opacity-50"
      >
        {phase === "working" ? "Deleting…" : "Delete my account"}
      </button>
      {phase === "error" && (
        <p role="alert" className="text-xs text-red-400">
          {message}
        </p>
      )}
    </section>
  );
}
