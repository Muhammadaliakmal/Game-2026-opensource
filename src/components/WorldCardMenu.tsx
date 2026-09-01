"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Kebab menu on a world card.
 *
 * Deleting is destructive and irreversible (no soft-delete column), so it's
 * two-stage: the menu item arms, and a second explicit click commits. That's
 * deliberately not `window.confirm` — a native modal blocks the whole page and
 * looks nothing like the rest of the HUD.
 *
 * Authorisation lives on the server: `DELETE /api/worlds/:id` scopes by the
 * Clerk user id, so this component never decides who may delete what.
 */
export function WorldCardMenu({
  worldId,
  worldName,
  published,
}: {
  worldId: string;
  worldName: string;
  published: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setArming(false);
    setError(null);
  };

  // Dismiss on outside click or Escape. Bound only while open, so a page full
  // of cards isn't holding N idle listeners.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setArming(false);
        setError(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setArming(false);
        setError(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function setPublished(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/worlds/${worldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!res.ok) throw new Error(`Could not update (${res.status})`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/play/${worldId}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Clipboard unavailable");
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Could not delete (${res.status})`);
      setOpen(false);
      // Re-runs the Server Component that renders the list, so the card goes
      // away without a full navigation.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  }

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="text-steel-200 hover:bg-steel-800 hover:text-steel-050 -mr-1 flex h-7 w-7 items-center justify-center rounded-[var(--radius)] transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${worldName}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="card absolute right-0 z-20 mt-1.5 w-48 overflow-hidden p-1 shadow-[var(--lift)]"
        >
          {!arming ? (
            <>
            <button
              role="menuitem"
              onClick={() => setPublished(!published)}
              disabled={busy}
              className="text-steel-200 hover:bg-steel-800 hover:text-steel-050 flex w-full items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-left text-2xs font-medium transition-colors disabled:opacity-50"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  published
                    ? "bg-mint"
                    : "bg-steel-500"
                }`}
              />
              {published ? "Unpublish" : "Publish"}
            </button>
            <button
              role="menuitem"
              onClick={copyLink}
              className="text-steel-200 hover:bg-steel-800 hover:text-steel-050 flex w-full items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-left text-2xs font-medium transition-colors"
            >
              <span className="w-2 shrink-0" />
              {copied ? "Link copied" : "Copy play link"}
            </button>
            <span className="bg-[var(--border-color)] my-1 block h-px" />
            <button
              role="menuitem"
              onClick={() => setArming(true)}
              className="text-danger hover:bg-danger/15 flex w-full items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-left text-2xs font-medium transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
              Delete world
            </button>
            {error && <p className="text-danger px-2.5 py-1 text-xs">{error}</p>}
            </>
          ) : (
            <div className="p-1">
              <p className="text-steel-200 mb-2 text-xs leading-snug">
                Delete <span className="text-steel-050 font-semibold">{worldName}</span>{" "}
                permanently? This can&apos;t be undone.
              </p>
              <div className="flex gap-1.5">
                <button
                  role="menuitem"
                  onClick={remove}
                  disabled={busy}
                  className="hud-chip hud-chip--danger flex-1 justify-center"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
                <button
                  onClick={() => setArming(false)}
                  disabled={busy}
                  className="hud-chip"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-danger mt-2 text-xs">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
