import type { Metadata } from "next";
import Link from "next/link";
import { GamesHub } from "@/components/modes/GamesHub";
import { PageShell, PageHeader } from "@/components/PageShell";
import { PrefetchCanvas } from "@/components/PrefetchCanvas";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  CABINET_COUNT,
  COURSE_COUNT,
  REGISTRY,
  type GameEntry,
} from "@/content/registry";
import { PARKOUR_COURSES } from "@/lib/built-in-worlds";
import { TIERS } from "@/lib/course-kit";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Everything you can play, at one address.
 *
 * The home page carries the same hub, but the home page is also the pitch,
 * the gallery and — signed in — your own worlds. "Games" in the header needs
 * to land on the games and nothing else, which is this.
 *
 * ── Why there is now an index under the hub ──────────────────────────────
 *
 * The hub is covers: pictures you press, which is the right thing for a
 * player and nothing at all for a crawler, since the covers are generated
 * SVG and the text on them is a title. This page was about twenty readable
 * words, and it is one click from the header on every screen.
 *
 * The list under it is the same games as text, grouped the way the ladder
 * groups them, each row linking to the written guide rather than to the
 * canvas. It is the index of the site's actual content — twenty-seven guides
 * and the pages explaining them — and until it existed those guides were
 * reachable only from the ladder and the arcade.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Games — every course and cabinet · ${SITE_NAME}`,
  description: `${COURSE_COUNT} parkour courses, a lap racer and ${CABINET_COUNT} arcade cabinets, with a written guide to each one. No download, no account needed to start.`,
  alternates: { canonical: `${SITE_URL}/games` },
};

/** A titled list of guide links. The only shape this page's index takes. */
function Index({
  heading,
  note,
  rows,
}: {
  heading: string;
  note?: string;
  rows: ReadonlyArray<{ slug: string; title: string; blurb: string }>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-ink text-base font-semibold">{heading}</h3>
        {note && <span className="hud-label">{note}</span>}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.slug} className="text-dim text-sm leading-relaxed">
            <Link
              href={`/games/${row.slug}`}
              className="text-accent underline"
            >
              {row.title}
            </Link>
            {" — "}
            {row.blurb}
          </li>
        ))}
      </ul>
    </section>
  );
}

const tierOf = (slug: string) =>
  PARKOUR_COURSES.find((c) => c.slug === slug)?.tier;

const rowsFor = (kind: GameEntry["kind"]) =>
  REGISTRY.filter((e) => e.kind === kind).map((e) => ({
    slug: e.slug,
    title: e.title,
    blurb: e.tagline,
  }));

export default function GamesPage() {
  return (
    <PageShell>
      <Breadcrumbs
        trail={[
          { href: "/", label: SITE_NAME },
          { href: "/games", label: "Games" },
        ]}
      />

      <PageHeader title="Games" back={null}>
        <p className="text-dim max-w-xl text-sm">
          {COURSE_COUNT} parkour courses on a difficulty ladder, a lap racer,
          and {CABINET_COUNT} arcade cabinets. Everything here is one press
          from playing, and every one of them has a written guide. No account
          needed to start.
        </p>
      </PageHeader>

      <GamesHub heading="Modes" />

      <div className="mt-12 flex max-w-2xl flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-xl font-bold">Every game, in writing</h2>
          <p className="text-dim text-sm leading-relaxed">
            Each guide covers what the thing is built from, how it is scored or
            timed, and one concrete thing to do differently. The course guides
            also carry the measured shape of the route — jumps, widest gap,
            total climb, biggest drop — read off the geometry the game builds
            rather than estimated. The method is on{" "}
            <Link
              href="/how-courses-are-made"
              className="text-accent underline"
            >
              how the courses are made
            </Link>
            .
          </p>
        </section>

        {/* The ladder, banded by tier and in ladder order — the same grouping
            `/parkour` uses, because two orderings of one list is how a reader
            loses track of which course is meant to come next. */}
        {TIERS.map((tier) => (
          <Index
            key={tier}
            heading={`${tier} courses`}
            rows={REGISTRY.filter(
              (e) => e.kind === "course" && tierOf(e.slug) === tier
            ).map((e) => ({
              slug: e.slug,
              title: e.title,
              blurb: e.tagline,
            }))}
          />
        ))}

        <Index
          heading="Arcade cabinets"
          note="A few minutes a go"
          rows={rowsFor("arcade")}
        />
        <Index
          heading="Sandbox worlds"
          note="No goal, no clock"
          rows={rowsFor("world")}
        />

        <AdSlot placement="guide" />
      </div>

      <PrefetchCanvas kind="world" on="intent" />
    </PageShell>
  );
}
