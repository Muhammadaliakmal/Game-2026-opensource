"use client";

import { useEffect, useState } from "react";
import { isMatchCode, makeMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { joinTogether, leaveTogether, useTogether } from "@/lib/net/together";
import { formatLapTime } from "@/stores/race-store";

/**
 * Playing this course with other people, on their own phones.
 *
 * Closed, it is one chip: "Play together". Pressed, it makes a code, puts it
 * in the address (`?together=CODE`) and joins — so the address IS the invite,
 * and a party that sends everyone to a course sends them that address. Open,
 * it shows the code and everyone's best time on this course this session.
 *
 * Under the run clock, because it is the same kind of thing: a number you
 * glance at between attempts.
 */

/** The `?together=` code in the address, if it is one. */
function codeInAddress(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("together");
  return raw && isMatchCode(raw) ? normalizeMatchCode(raw) : null;
}

export function TogetherChip({ worldId, isDraft }: { worldId: string; isDraft: boolean }) {
  const code = useTogether((s) => s.code);
  const runners = useTogether((s) => s.runners);
  const best = useTogether((s) => s.best);
  const selfName = useTogether((s) => s.selfName);
  const [copied, setCopied] = useState(false);

  // Arriving on a together link joins it. Leaving the course leaves it.
  useEffect(() => {
    if (isDraft) return;
    const fromLink = codeInAddress();
    if (fromLink) void joinTogether(fromLink, worldId);
    return () => leaveTogether();
  }, [worldId, isDraft]);

  // A draft lives only in this browser; nobody else could load it.
  if (isDraft) return null;

  const start = () => {
    const next = makeMatchCode();
    const url = new URL(window.location.href);
    url.searchParams.set("together", next);
    window.history.replaceState(null, "", url);
    void joinTogether(next, worldId);
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Run this course with me", url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* Dismissed. */
    }
  };

  if (!code) {
    return (
      <button type="button" className="hud-chip pointer-events-auto text-xs" onClick={start}>
        Play together
      </button>
    );
  }

  const rows = [{ id: "self", name: `${selfName} (you)`, best }, ...runners].sort(
    (a, b) => (a.best ?? Infinity) - (b.best ?? Infinity)
  );

  return (
    <div className="hud-panel hud-panel--readout pointer-events-auto flex min-w-[11rem] flex-col gap-1 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="hud-label">
          Together <span className="num tracking-widest">{code}</span>
        </span>
        <button type="button" className="hud-label text-accent" onClick={share}>
          {copied ? "Copied" : "Invite"}
        </button>
      </div>
      {runners.length === 0 && <span className="text-dim">Waiting for others… send the invite.</span>}
      <ol className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span className={`truncate ${r.id === "self" ? "text-accent" : "text-ink"}`}>{r.name}</span>
            <span className="num text-dim">{r.best === null ? "—" : formatLapTime(r.best)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
