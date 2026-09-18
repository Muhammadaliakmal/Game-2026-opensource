import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";
import {
  CommunityCourses,
  CommunityCoursesFallback,
} from "@/components/modes/CommunityCourses";
import { UGC } from "@/lib/features";
import { AdSlot } from "@/components/AdSlot";
import { SiteFooter } from "@/components/SiteFooter";
import { PrefetchCanvas } from "@/components/PrefetchCanvas";

/**
 * The public gallery.
 *
 * No comments and no featured feed, on purpose: SPEC §9 #4 flags both as the
 * traps for a solo dev — moderation and child-safety liability on one side,
 * ops burden on the other. Sorting is by play count, which is a fact rather
 * than an editorial decision.
 *
 * Cards show a static cover image, not a live 3D preview — rendering dozens
 * of R3F canvases in a grid would destroy the frame budget. The image is a
 * downscaled capture of the builder's own canvas taken on save (see
 * lib/canvas-thumbnail.ts), so a world with no thumbnail yet is simply one
 * that hasn't been saved since this shipped.
 *
 * ── Two lists of player worlds, not one ──────────────────────────────────
 *
 * A published world that can be finished is a different offer from a
 * published world to walk around in, and the page says so rather than sorting
 * them together. The split is `floor_ms` — see `lib/db/courses.ts` — and it is
 * a partition: the courses section takes those worlds and the general list
 * below excludes them, so nothing is listed twice.
 */
export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  // BUILT_IN_WORLDS is already in ladder order, so this is a partition and not
  // a sort — the difficulty sequence is defined once, where the maps are.
  const ladder = BUILT_IN_WORLDS.filter((w) => w.tier);
  const sandboxes = BUILT_IN_WORLDS.filter((w) => !w.tier);

  // Metadata only — see the note on the home page: a gallery of 60 worlds
  // would otherwise pull 60 full WorldDocs just to render a part count.
  const published = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      playCount: worlds.playCount,
      thumbnailUrl: worlds.thumbnailUrl,
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`
        .mapWith(Number),
    })
    .from(worlds)
    // Courses are excluded here because they have their own section above,
    // and a world that appears in both makes this list look like a second
    // helping of the same thing rather than the rest of what people built.
    // "Can be finished" is the more specific claim, so it wins the world.
    .where(and(eq(worlds.published, 1), isNull(worlds.floorMs)))
    .orderBy(desc(worlds.playCount), desc(worlds.updatedAt))
    .limit(60);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-xl font-bold">Browse worlds</h1>

      {/* The ladder first, in difficulty order, because it is the thing to do
          on a first visit — and the tier is on the card rather than implied by
          position, so a player who lands here from a link still knows what
          they are opening. */}
      <h2 className="mb-4 text-ink text-base font-semibold">The parkour ladder</h2>
      <ul className="mb-10 grid gap-4 sm:grid-cols-2">
        {ladder.map((w) => (
          <li
            key={w.slug}
            className="card hover:border-accent/50 p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-ink text-base font-semibold">{w.name}</h3>
              <span className="hud-label shrink-0">{w.tier}</span>
            </div>
            <p className="text-dim mt-1 text-sm">{w.blurb}</p>
            <Link
              href={`/play/${w.slug}`}
              className="hud-chip hud-chip--primary mt-4"
            >
              Play
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mb-4 text-ink text-base font-semibold">Sandboxes</h2>
      <ul className="mb-10 grid gap-4 sm:grid-cols-2">
        {sandboxes.map((w) => (
          <li
            key={w.slug}
            className="card hover:border-accent/50 p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-ink text-base font-semibold">{w.name}</h3>
              <span className="hud-label shrink-0">Built-in</span>
            </div>
            <p className="text-dim mt-1 text-sm">{w.blurb}</p>
            <Link
              href={`/play/${w.slug}`}
              className="hud-chip hud-chip--primary mt-4"
            >
              Play
            </Link>
          </li>
        ))}
      </ul>

      {/* Above the general list, because it is the one people can *do*
          something with: a published sandbox is a place to look at, a
          published course is a clock to beat. Streamed in its own boundary so
          the ladder and the sandboxes — both of which come from code — are on
          screen before the query for this one has landed. */}
      <h2 className="mb-4 text-ink text-base font-semibold">Player-made courses</h2>
      <div className="mb-10">
        <Suspense fallback={<CommunityCoursesFallback />}>
          <CommunityCourses limit={12} />
        </Suspense>
      </div>

      <h2 className="mb-4 text-ink text-base font-semibold">Published by players</h2>

      {published.length === 0 ? (
        <div className="text-dim rounded-[var(--radius)] border border-dashed border-[var(--border-color)] p-12 text-center text-sm">
          {/* An empty state is a place to send someone, and with the builder
              hidden (lib/features) "build something" sends them nowhere. */}
          {UGC ? (
            <>
              Nothing else published yet. Build something and publish it from
              your world&apos;s ⋮ menu.
            </>
          ) : (
            <>
              Nothing else published yet. The parkour courses and the built-in
              worlds are on the home page.
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((w) => (
            <li
              key={w.id}
              className="card hover:border-accent/50 p-4 transition-colors"
            >
              {w.thumbnailUrl && (
                // A data URI or (later) an R2 URL — next/image has nothing to optimize here.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={w.thumbnailUrl}
                  alt=""
                  className="mb-3 aspect-video w-full rounded-[var(--radius)] object-cover"
                />
              )}
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

      {/* Under the gallery, never between the cards — see lib/ads. */}
      <AdSlot placement="browse" className="mt-10" />
      <PrefetchCanvas kind="world" />
      <SiteFooter />
    </div>
  );
}
