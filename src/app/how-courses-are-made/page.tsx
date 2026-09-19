import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader } from "@/components/PageShell";
import { SiteFooter } from "@/components/SiteFooter";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { COURSE_COUNT } from "@/content/registry";
import { DESIGN_MARGIN } from "@/lib/jump-arc";
import { FEEL } from "@/lib/feel";
import { TIERS } from "@/lib/course-kit";
import { OWNER_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * How the courses are designed, checked and timed.
 *
 * ── Why a games site needs a methodology page ────────────────────────────
 *
 * An ad review is an assessment of whether anything on a site should be
 * believed, and the About page answers that with an identity: a named person
 * in a named city. This page answers it with a process, which is the half
 * identity cannot supply. It is the "editorial standards" page a publication
 * has, written for the thing this site actually publishes — levels.
 *
 * It is also the page the guide pages lean on. Every one of them prints a
 * medal time and a measured route, and a reader is entitled to ask where
 * those came from before trusting the twenty-seven pages that quote them.
 * The answer is here, once, rather than in a footnote on each.
 *
 * ── Every number on it is imported ───────────────────────────────────────
 *
 * `DESIGN_MARGIN`, `FEEL.fallGravityScale`, `COURSE_COUNT`, the tier list —
 * none of them are typed into the prose. A methodology page that states a
 * constant which has since changed is worse than no methodology page, and the
 * only defence that survives a year of edits is not writing the number down
 * twice.
 */
export const dynamic = "force-static";

const TITLE = "How the courses are made";
const SUMMARY =
  "Every jump on the ladder is built against a computed arc, every course is " +
  "proved finishable by a solver, and every medal time is derived from the " +
  "geometry rather than guessed.";

export const metadata: Metadata = {
  title: `${TITLE} · ${SITE_NAME}`,
  description: SUMMARY,
  alternates: { canonical: `${SITE_URL}/how-courses-are-made` },
  openGraph: {
    title: `${TITLE} · ${SITE_NAME}`,
    description: SUMMARY,
    url: `${SITE_URL}/how-courses-are-made`,
    type: "article",
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-bold">{title}</h2>
      <div className="text-dim flex flex-col gap-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function HowCoursesAreMadePage() {
  const pct = Math.round(DESIGN_MARGIN * 100);

  return (
    <PageShell mode="parkour" width="prose">
      <Breadcrumbs
        trail={[
          { href: "/", label: SITE_NAME },
          { href: "/parkour", label: "Parkour" },
          { href: "/how-courses-are-made", label: TITLE },
        ]}
      />

      <PageHeader title={TITLE} back={null}>
        <p className="text-dim max-w-xl text-sm">{SUMMARY}</p>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <Section title="Why this page exists">
          <p>
            There are {COURSE_COUNT} parkour courses on this site and each one
            has a page quoting a medal time and a measured route. This is where
            those numbers come from. If a course guide says a jump is 4.1 cells
            and the Author time is two minutes, the method below is what makes
            that a measurement rather than a claim.
          </p>
          <p>
            It is written by {OWNER_NAME}, who built all of it. Everything
            described here is in the source of the game, and the constants on
            this page are imported from it rather than typed out — so if a
            number here is wrong, the game is wrong too.
          </p>
        </Section>

        <Section title="The jump comes first, and it is computed">
          <p>
            A platformer is its jump. Ours rises and falls under different
            gravities — the fall is{" "}
            <span className="num text-ink">{FEEL.fallGravityScale}×</span> the
            rise, which is the single largest lever on how the game feels —
            and that makes the arc asymmetric. The textbook airtime formula is
            wrong for it by roughly 40%.
          </p>
          <p>
            So the arc is not a number in a comment. It is derived from the
            movement config, and every course is built against the derived
            value. Retune the jump and the courses are re-checked against the
            new arc automatically; nothing silently becomes impossible because
            a constant was folded by hand into a level six weeks earlier.
          </p>
        </Section>

        <Section title="Courses are designed at 80% of what is possible">
          <p>
            A jump built at 100% of the character&apos;s reach is one you make
            by leaving the platform on the last frame at exactly full speed.
            That is a frame-perfect input for a move the game asks for a
            hundred times a run, and a course full of them is not hard, it is
            unfair.
          </p>
          <p>
            Every gap is therefore designed against{" "}
            <span className="num text-ink">{pct}%</span> of the computed reach.
            Expert courses spend that margin; the safety underneath it is not
            spent by anything. It also absorbs an optimism in the model, which
            assumes you keep full horizontal speed through the air when air
            control is only{" "}
            <span className="num text-ink">{FEEL.airControl}</span>.
          </p>
          <p>
            One more thing that sounds pedantic and is not: a gap is counted in{" "}
            <em>empty cells between platforms</em>, not centre to centre. Two
            pads three cells apart have two cells of air between them. Getting
            that wrong by one is how a jump becomes frame-perfect by accident.
          </p>
        </Section>

        <Section title="Every course is proved finishable before it ships">
          <p>
            A course is turned into a graph of every surface you can stand on,
            with an edge wherever the arc says one place can be reached from
            another. The test suite then walks it and refuses to ship a course
            where the goal cannot be reached from the spawn.
          </p>
          <p>
            It checks a second thing that matters more and is easier to miss:
            that the goal is still reachable{" "}
            <em>from every checkpoint</em>. A resume point you cannot continue
            from is not a mercy, it is a soft lock — the run is alive, the
            clock is running, and the course is over. Hazard blocks are
            excluded from the graph, so a route that would have to cross lava
            is not counted as a route.
          </p>
        </Section>

        <Section title="Medal times are derived, not guessed">
          <p>
            The same graph is solved for the cheapest route: walking edges cost
            distance over run speed, jump edges cost their airtime. That number
            is a hard physical floor. It assumes instant acceleration, perfect
            pathing and never looking at where you are going, so nobody will
            ever match it — it is not a target, it is a measurement of the
            course.
          </p>
          <p>
            The Author time is that floor multiplied by a single constant
            representing how much slower a very good human is, and the other
            three medals are multiples of the Author time. That constant is the
            one genuinely unverified number in the system, and it is stated as
            such in the source: it is an assumption awaiting real play data,
            not a finding.
          </p>
          <p>
            What the derivation does buy is that a medal can never be
            impossible, because it is anchored to a route the geometry admits;
            and that it cannot silently rot, because moving a single pad moves
            the floor and the test suite fails with the new value.
          </p>
        </Section>

        <Section title="What the difficulty tiers mean">
          <p>
            The ladder runs {TIERS.join(" → ")}. The tiers are not a difficulty
            number attached to a finished course — they are a statement about
            what the course is asking for, and the course is built to ask for
            it:
          </p>
          <ul className="ml-4 flex list-disc flex-col gap-2">
            <li>
              <span className="text-ink font-semibold">Tutorial</span> — learn
              the jump. Wide landings, short falls, the whole route visible.
            </li>
            <li>
              <span className="text-ink font-semibold">Easy</span> — learn it
              properly. The same jump, many times, with a clock on it.
            </li>
            <li>
              <span className="text-ink font-semibold">Medium</span> — learn to
              turn. Direction changes at speed, with landings still forgiving.
            </li>
            <li>
              <span className="text-ink font-semibold">Hard</span> — one-block
              landings. The distances are ordinary; the margin is not.
            </li>
            <li>
              <span className="text-ink font-semibold">Expert</span> — on the
              limit. Courses that spend the full design margin.
            </li>
            <li>
              <span className="text-ink font-semibold">Obby</span> — hazards.
              Failure is instant rather than positional.
            </li>
          </ul>
        </Section>

        <Section title="What the guide pages measure, and what they do not">
          <p>
            Each course guide prints the blocks it is built from, its
            footprint, its checkpoints, and the shape of the solved route —
            jumps, widest gap, total climb, biggest drop. All of those are read
            off the geometry the game actually builds, by a script, and a test
            fails if a course is edited and the numbers are not regenerated.
          </p>
          <p>
            What they are not is a description of your run. The solver walks
            surfaces with no air control and no momentum; you will take more
            jumps than it does, on a different line. The figures describe the
            course, not the player, and the guides say so on every page rather
            than letting a reader assume otherwise.
          </p>
          <p>
            There are no player counts, average completion times or
            satisfaction scores anywhere on this site, because there is no
            honest way to produce them yet. A number nobody can check is worth
            less than a sentence they can.
          </p>
        </Section>

        <Section title="Where to start">
          <p>
            The{" "}
            <Link href="/parkour" className="text-accent underline">
              ladder
            </Link>{" "}
            is in the order the courses are meant to be played. If you have
            never played this game,{" "}
            <Link href="/games/parkour" className="text-accent underline">
              Neon Run
            </Link>{" "}
            is the tutorial and{" "}
            <Link href="/games/steps" className="text-accent underline">
              Harbour Steps
            </Link>{" "}
            is the gentlest thing on the site. If you want to see what the
            design margin looks like when it is fully spent, read{" "}
            <Link href="/games/overclock" className="text-accent underline">
              Overclock
            </Link>
            .
          </p>
        </Section>

        <AdSlot placement="guide" />
        <SiteFooter />
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: SUMMARY,
          url: `${SITE_URL}/how-courses-are-made`,
          author: { "@type": "Person", name: OWNER_NAME },
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
          },
        }}
      />
    </PageShell>
  );
}
