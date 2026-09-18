"use client";

import Link from "next/link";
import { useArcade } from "@/arcade/store";
import { bySlug } from "@/content/registry";
import { useRecentPlays } from "@/lib/last-played";
import { formatTime } from "@/components/play/course";

/**
 * The last six things this browser played, newest first.
 *
 * ── Why it is above "Play" and not in it ─────────────────────────────────
 *
 * Because it is not a choice. Everything below it is the site asking what you
 * would like to do; this is the site remembering what you were already doing,
 * and a returning player should meet that first. It renders nothing at all on
 * a first visit, so a new visitor never sees an empty shelf where the
 * interesting part should be.
 *
 * ── The resume state ─────────────────────────────────────────────────────
 *
 * A row is worth more than a link if it says where you got to. A course shows
 * the personal best held for it (`blockworld:best:<slug>`, the same key the
 * finish panel writes); a cabinet shows its high score, read from the arcade's
 * own store. Both are local, both are already in this browser, and neither
 * costs a request.
 *
 * A row with nothing to report simply does not show a second line. It is not
 * padded with "—": this is a rail of six, not a table, and a column of em
 * dashes would be six rows of nothing arranged to look like data.
 *
 * ── Why the best time is read here and not through a hook ────────────────
 *
 * `useCourse` holds the best for the ONE world currently loaded and is
 * deliberately guarded against showing another world's — see the comment on
 * its `worldId` field. This needs six of them at once, for worlds that are not
 * loaded, so it reads the keys directly. Reading is all it does; the store
 * remains the only writer.
 */

/** The key `play/course.ts` writes a personal best under. */
const bestKeyFor = (slug: string) => `blockworld:best:${slug}`;

function readBestMs(slug: string): number | null {
  try {
    const raw = localStorage.getItem(bestKeyFor(slug));
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

export function JumpBackIn() {
  const recent = useRecentPlays();
  // The arcade's bests, already mirrored into a store React can read.
  const arcadeBest = useArcade((s) => s.best);

  if (recent.length === 0) return null;

  return (
    <section
      className="rise-in flex flex-col gap-3"
      style={{ "--rise-i": 0 } as React.CSSProperties}
    >
      <h2 className="text-xl font-bold">Jump back in</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {recent.map((row) => {
          const entry = row.slug ? bySlug.get(row.slug) : undefined;

          /*
           * What this row got to, if anything.
           *
           * Read at render, from storage, on a client component that only
           * exists in the browser — so there is no server pass for it to
           * disagree with, and no effect that would paint the row once
           * without the number and again with it.
           */
          let resume: string | null = null;
          if (entry?.kind === "arcade") {
            const score = arcadeBest[entry.slug];
            if (score) resume = `Best ${score}`;
          } else if (entry && (entry.kind === "course" || entry.kind === "world")) {
            const ms = readBestMs(entry.slug);
            if (ms !== null) resume = `Best ${formatTime(ms)}`;
          }

          return (
            <li key={row.href}>
              <Link
                href={row.href}
                className="card hover:border-accent/70 focus-visible:border-accent/70 flex h-full flex-col gap-0.5 p-3 transition-colors"
              >
                <span className="text-ink truncate text-sm font-semibold">
                  {row.title}
                </span>
                {resume ? (
                  <span className="hud-label num truncate">{resume}</span>
                ) : (
                  <span className="hud-label truncate">
                    {entry?.kind === "arcade" ? "Arcade" : "Continue"}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
