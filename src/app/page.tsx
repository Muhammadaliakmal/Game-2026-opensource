import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { NewWorldButton } from "@/components/NewWorldButton";
import { WorldCardMenu } from "@/components/WorldCardMenu";
import { RemixButton } from "@/components/RemixButton";
import { HeroMount } from "@/components/hero/HeroMount";
import { PARKOUR_COURSES, SANDBOX_WORLDS } from "@/lib/built-in-worlds";
import { ModeCard } from "@/components/modes/ModeCard";
import { MAX_RIDERS, RACE_LAPS } from "@/lib/race-track";
import { UGC } from "@/lib/features";
import { AdSlot } from "@/components/AdSlot";
import { SiteFooter } from "@/components/SiteFooter";
import { PrefetchCanvas } from "@/components/PrefetchCanvas";

/**
 * Home: a live world for a visitor, a world list for a player.
 *
 * The visitor's half follows UI spec §3.1 — the hero is a live scene, not
 * text. Someone lands, turns a world with a drag, places a block, and has
 * used the product before reading a word; the headline underneath is then
 * confirming what they just did rather than making a claim.
 *
 * The headline copy survived the redesign on purpose. "Build worlds out of
 * blocks, then walk around inside them" is concrete and specific, and its old
 * gradient accent word and "Build · Play · Remix" eyebrow were template
 * chrome that said nothing it does not.
 *
 * It does move for the scope cut, because it stops being true. With the
 * builder hidden (`lib/features`) the first promise this page makes has to be
 * one the visitor can act on, so the headline, the sub-copy and the primary
 * button all lead with parkour instead. Both sets of words live here rather
 * than one replacing the other: flipping `UGC` back has to restore the pitch,
 * not just re-expose a button under a headline that no longer matches it.
 */

/**
 * The two things you can go and do, as covers rather than as a list.
 *
 * ── Order ────────────────────────────────────────────────────────────────
 *
 * Parkour first and race second, and not alphabetically. Parkour is the mode
 * that works alone, offline, on the first visit, with no code to share and
 * nobody else needed; racing needs a room server and — to be a race rather
 * than a time trial — somebody else. Leading with the one that can fail to
 * connect is leading with the one that can disappoint.
 *
 * ── Why both are one tile each ───────────────────────────────────────────
 *
 * Racing used to be a chip in the page header, which is the same as not
 * shipping it: a five-word link between "Browse" and "Get the app" does not
 * read as a game mode. And the parkour courses used to be entries in a flat
 * list of built-in worlds, so the ladder they form was invisible. One cover
 * each, one screen behind each, and the covers are drawn from the game's own
 * night sky so they show what pressing them gets you.
 */
function Modes() {
  return (
    <section>
      <h2 className="mb-4 text-xl font-bold">Play</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <ModeCard
          href="/parkour"
          art="parkour"
          eyebrow={`${PARKOUR_COURSES.length} courses · Tutorial to Expert`}
          title="Parkour"
          blurb="Jump it, time it, take the medal. Checkpoints keep the clock running through a fall, and a ghost of your best run is out there ahead of you."
          meta={["Solo", "Medals", "Ghosts", "Leaderboards"]}
          cta="Choose a course"
        />
        <ModeCard
          href="/race"
          art="race"
          eyebrow={`Up to ${MAX_RIDERS} riders · ${RACE_LAPS} laps`}
          title="Race"
          blurb="Neon Circuit, on bikes. Drift to fill the boost, spend it down the straight, and send the code to whoever you want on the grid."
          meta={["Multiplayer", "Boost", "Drift", "Time trial"]}
          cta="Open a grid"
        />
      </div>
    </section>
  );
}

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
        thumbnailUrl: worlds.thumbnailUrl,
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

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-7 sm:gap-12 sm:px-6 sm:py-10">
          <section className="flex flex-col items-start gap-5">
            <h1 className="text-display max-w-2xl font-bold">
              {UGC
                ? "Build worlds out of blocks, then walk around inside them."
                : "Twenty courses, one clock, and the ghost of your best run."}
            </h1>
            <p className="text-dim text-sm">
              {UGC
                ? "A voxel editor and a platformer in the same browser tab. Place a block, hit play, and you're standing on it. No account needed to start."
                : "A platformer in a browser tab. Time a run, take the medal, then go again against a ghost of the run before it. No account needed to start."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={UGC ? "/build/new" : "/parkour"}
                className="hud-chip hud-chip--primary px-6 py-3"
              >
                {UGC ? "Start building" : "Play parkour"}
              </Link>
              <Link href="/browse" className="hud-chip px-6 py-3">
                Browse worlds
              </Link>
            </div>
          </section>

          <Modes />

          {/* The worlds with nothing to complete. Kept as a plain list on
              purpose: they are somewhere to stand and look around, not a mode,
              and giving them cover art would claim they were. */}
          <section>
            <h2 className="mb-4 text-xl font-bold">Worlds to explore</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {SANDBOX_WORLDS.map((w) => (
                <li
                  key={w.slug}
                  className="card hover:border-accent/50 p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold">{w.name}</h3>
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
          </section>

          {showcase.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">Worlds people made</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {showcase.map((w) => (
                  <li
                    key={w.id}
                    className="card hover:border-accent/50 p-4 transition-colors"
                  >
                    {w.thumbnailUrl && (
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
            </section>
          )}

          {/* Last thing on the page, under real content — see lib/ads. */}
          <AdSlot placement="home" />
          <PrefetchCanvas kind="world" />
          <SiteFooter />
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
      thumbnailUrl: worlds.thumbnailUrl,
      partCount: sql<number>`jsonb_array_length(${worlds.doc} -> 'parts')`
        .mapWith(Number),
    })
    .from(worlds)
    .where(eq(worlds.ownerId, userId))
    .orderBy(desc(worlds.updatedAt));

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      {/* The modes first: they are always here, and they give a brand-new
          account something to do before it has built anything. */}
      <div className="mb-8 sm:mb-12">
        <Modes />
      </div>

      <section className="mb-8 sm:mb-12">
        <h2 className="mb-4 text-xl font-bold">Worlds to explore</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {SANDBOX_WORLDS.map((w) => (
            <li
              key={w.slug}
              className="card hover:border-accent/50 p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold">{w.name}</h3>
                <span className="hud-label shrink-0">Built-in</span>
              </div>
              <p className="text-dim mt-1 text-sm">{w.blurb}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/play/${w.slug}`}
                  className="hud-chip hud-chip--primary"
                >
                  Play
                </Link>
                {/* Remix is the door into the builder, and v1 does not open it
                    — see lib/features. The route still works for anyone who
                    has one open. */}
                {UGC && <RemixButton from={w.slug} name={w.name} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Your worlds ──
          Hidden wholesale in v1 rather than emptied: a heading reading "Your
          worlds (0)" over a dashed box explaining how to make one is the
          builder advertising itself, which is the thing the scope cut is
          about. Anyone who already has worlds still reaches them by URL, and
          flipping UGC brings the whole section back. */}
      {UGC && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-bold">
              {myWorlds.length === 0
                ? "Your worlds"
                : `Your worlds (${myWorlds.length})`}
            </h2>
            <NewWorldButton />
          </div>

          {myWorlds.length === 0 ? (
            <div className="text-dim rounded-[var(--radius)] border border-dashed border-[var(--border-color)] p-12 text-center text-sm">
              Nothing here yet. Hit{" "}
              <span className="text-accent font-semibold">New world</span> and
              start placing blocks — or remix one of the featured worlds above.
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myWorlds.map((w) => (
                // The card cannot clip its overflow: the kebab menu opens
                // outside its bounds.
                <li
                  key={w.id}
                  className="card hover:border-accent/50 relative p-4 transition-colors"
                >
                  {w.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.thumbnailUrl}
                      alt=""
                      className="mb-3 aspect-video w-full rounded-[var(--radius)] object-cover"
                    />
                  )}
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
                        <span className="text-accent">
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
        </>
      )}

      {/* Last thing on the page, under real content — see lib/ads. */}
      <AdSlot placement="home" />
      <PrefetchCanvas kind="world" />
      <SiteFooter />
    </div>
  );
}
