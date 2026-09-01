import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";

/**
 * The public gallery.
 *
 * No comments and no featured feed, on purpose: SPEC §9 #4 flags both as the
 * traps for a solo dev — moderation and child-safety liability on one side,
 * ops burden on the other. Sorting is by play count, which is a fact rather
 * than an editorial decision.
 *
 * Cards carry no thumbnail yet. Rendering live 3D previews in a grid would
 * destroy the frame budget, and the offscreen-render-at-publish route needs
 * the R2 bucket that is not configured yet, so the card leads with the facts
 * it can actually stand behind: size and play count.
 */
export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  // Metadata only — see the note on the home page: a gallery of 60 worlds
  // would otherwise pull 60 full WorldDocs just to render a part count.
  const published = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      playCount: worlds.playCount,
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`
        .mapWith(Number),
    })
    .from(worlds)
    .where(eq(worlds.published, 1))
    .orderBy(desc(worlds.playCount), desc(worlds.updatedAt))
    .limit(60);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-xl font-bold">Browse worlds</h1>

      <ul className="mb-10 grid gap-4 sm:grid-cols-2">
        {BUILT_IN_WORLDS.map((w) => (
          <li
            key={w.slug}
            className="card hover:border-signal/50 p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{w.name}</h2>
              <span className="hud-label shrink-0">Built-in</span>
            </div>
            <p className="text-steel-200 mt-1 text-sm">{w.blurb}</p>
            <Link
              href={`/play/${w.slug}`}
              className="hud-chip hud-chip--primary mt-4"
            >
              Play
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mb-4 text-base font-semibold">Published by players</h2>

      {published.length === 0 ? (
        <div className="text-steel-200 rounded-[var(--radius)] border border-dashed border-[var(--border-color)] p-12 text-center text-sm">
          Nothing published yet. Build something and publish it from your
          world&apos;s ⋮ menu.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((w) => (
            <li
              key={w.id}
              className="card hover:border-signal/50 p-4 transition-colors"
            >
              <h3 className="truncate text-sm font-semibold">{w.name}</h3>
              <p className="hud-label num mt-1">
                {w.partCount.toLocaleString()} parts ·{" "}
                {w.playCount.toLocaleString()} plays
              </p>
              <Link
                href={`/play/${w.id}`}
                className="hud-chip hud-chip--primary mt-4"
              >
                Play
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
