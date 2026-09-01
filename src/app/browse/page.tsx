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
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <span className="hud-label text-plasma">Community</span>
      <h1 className="mt-1 mb-8 text-3xl font-black tracking-tight">
        Browse worlds
      </h1>

      <ul className="mb-10 grid gap-4 sm:grid-cols-2">
        {BUILT_IN_WORLDS.map((w) => (
          <li key={w.slug} className="hud-panel relative overflow-hidden p-5">
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${
                w.accent === "neon" ? "from-neon to-plasma" : "from-mint to-acid"
              }`}
            />
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-black tracking-tight">{w.name}</h2>
              <span className="hud-label text-dim shrink-0">Built-in</span>
            </div>
            <p className="text-muted mt-1.5 text-sm">{w.blurb}</p>
            <Link
              href={`/play/${w.slug}`}
              className={`hud-chip mt-5 ${
                w.accent === "neon" ? "hud-chip--neon" : "hud-chip--mint"
              }`}
            >
              ▶ Play
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="hud-label mb-4">Published by players</h2>

      {published.length === 0 ? (
        <div className="border-line text-muted rounded-2xl border border-dashed p-12 text-center text-sm">
          Nothing published yet. Build something and publish it from your
          world&apos;s ⋮ menu.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((w) => (
            <li
              key={w.id}
              className="hud-panel group hover:border-neon/60 relative p-4 transition-colors"
            >
              <h3 className="truncate font-bold">{w.name}</h3>
              <p className="hud-label mt-1.5">
                {w.partCount.toLocaleString()} parts ·{" "}
                {w.playCount.toLocaleString()} plays
              </p>
              <Link
                href={`/play/${w.id}`}
                className="hud-chip hud-chip--mint mt-4"
              >
                ▶ Play
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
