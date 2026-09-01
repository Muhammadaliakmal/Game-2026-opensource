import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { NewWorldButton } from "@/components/NewWorldButton";
import { WorldCardMenu } from "@/components/WorldCardMenu";
import { RemixButton } from "@/components/RemixButton";
import { HeroMount } from "@/components/hero/HeroMount";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";

/**
 * Home: a live world for a visitor, a world list for a player.
 *
 * The visitor's half follows UI spec §3.1 — the hero is a live scene, not
 * text. Someone lands, turns a world with a drag, places a block, and has
 * used the product before reading a word; the headline underneath is then
 * confirming what they just did rather than making a claim.
 *
 * The headline copy is unchanged on purpose. "Build worlds out of blocks,
 * then walk around inside them" is concrete and specific, and its old
 * gradient accent word and "Build · Play · Remix" eyebrow were template
 * chrome that said nothing it does not.
 */
export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    // Real worlds with real play counts — the gallery is the proof, so it
    // should not be a row of invented placeholders.
    const showcase = await db
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
      .limit(4);

    return (
      <div className="flex w-full flex-1 flex-col">
        <HeroMount />

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
          <section className="flex flex-col items-start gap-5">
            <h1 className="max-w-2xl text-3xl leading-[1.1] font-bold sm:text-4xl">
              Build worlds out of blocks, then walk around inside them.
            </h1>
            <p className="text-steel-200 text-sm">
              A voxel editor and a platformer in the same browser tab. Place a
              block, hit play, and you&apos;re standing on it. No account
              needed to start.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/build/new"
                className="hud-chip hud-chip--primary px-6 py-3"
              >
                Start building
              </Link>
              <Link href="/browse" className="hud-chip px-6 py-3">
                Browse worlds
              </Link>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold">Worlds to play</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {BUILT_IN_WORLDS.map((w) => (
                <li
                  key={w.slug}
                  className="card hover:border-signal/50 p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold">{w.name}</h3>
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
          </section>

          {showcase.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">Worlds people made</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {showcase.map((w) => (
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
            </section>
          )}
        </div>
      </div>
    );
  }

  // Explicit columns, never `select()`. The card shows a part *count*, and
  // SELECT * would drag every world's entire WorldDoc across the wire to get
  // it — a large world runs to hundreds of KB of JSON. Postgres can count the
  // array in place for a few bytes.
  const myWorlds = await db
    .select({
      id: worlds.id,
      name: worlds.name,
      published: worlds.published,
      playCount: worlds.playCount,
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`
        .mapWith(Number),
    })
    .from(worlds)
    .where(eq(worlds.ownerId, userId))
    .orderBy(desc(worlds.updatedAt));

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      {/* Built-ins first: they are always here, and they give a brand-new
          account something to play before it has built anything. */}
      <section className="mb-12">
        <h2 className="mb-4 text-xl font-bold">Featured worlds</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {BUILT_IN_WORLDS.map((w) => (
            <li
              key={w.slug}
              className="card hover:border-signal/50 p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold">{w.name}</h3>
                <span className="hud-label shrink-0">Built-in</span>
              </div>
              <p className="text-steel-200 mt-1 text-sm">{w.blurb}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/play/${w.slug}`}
                  className="hud-chip hud-chip--primary"
                >
                  Play
                </Link>
                <RemixButton from={w.slug} name={w.name} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold">
          {myWorlds.length === 0
            ? "Your worlds"
            : `Your worlds (${myWorlds.length})`}
        </h2>
        <NewWorldButton />
      </div>

      {myWorlds.length === 0 ? (
        <div className="text-steel-200 rounded-[var(--radius)] border border-dashed border-[var(--border-color)] p-12 text-center text-sm">
          Nothing here yet. Hit{" "}
          <span className="text-signal font-semibold">New world</span> and start
          placing blocks — or remix one of the featured worlds above.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myWorlds.map((w) => (
            // The card cannot clip its overflow: the kebab menu opens outside
            // its bounds.
            <li
              key={w.id}
              className="card hover:border-signal/50 relative p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate text-sm font-semibold">
                  {w.name}
                </h3>
                <WorldCardMenu
                  worldId={w.id}
                  worldName={w.name}
                  published={w.published === 1}
                />
              </div>
              <p className="hud-label num mt-1 flex flex-wrap items-center gap-x-1.5">
                <span>{w.partCount.toLocaleString()} parts</span>
                {w.published === 1 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-signal">
                      Public · {w.playCount.toLocaleString()} plays
                    </span>
                  </>
                )}
              </p>
              <div className="mt-4 flex gap-2">
                <Link href={`/build/${w.id}`} className="hud-chip">
                  Build
                </Link>
                <Link
                  href={`/play/${w.id}`}
                  className="hud-chip hud-chip--primary"
                >
                  Play
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
