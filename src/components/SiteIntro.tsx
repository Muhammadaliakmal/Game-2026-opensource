import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { CABINET_COUNT, COURSE_COUNT } from "@/content/registry";
import { TIERS } from "@/lib/course-kit";
import { DESIGN_MARGIN } from "@/lib/jump-arc";
import { OWNER_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * What this site is, in words, under the fold.
 *
 * ── Why the home page needs any of this ──────────────────────────────────
 *
 * Because everything above it is a canvas, a grid of covers and a headline,
 * and a crawler reads none of the first two. Signed out, this page used to
 * resolve to about ninety words of readable text — a heading, one sentence of
 * sub-copy, and some card labels — on the single most important URL on the
 * domain. That is not a page that happens to be short; it is the page an ad
 * review forms its first opinion from.
 *
 * ── Why it is below the games and not above them ─────────────────────────
 *
 * The spec's argument for the hero has not changed: somebody lands, turns a
 * world with a drag, and has used the product before reading a word. Putting
 * three sections of prose between them and the thing to press would be
 * fixing a crawler's problem by creating a player's. So the games come first,
 * this comes after, and the only people who read it are the ones who wanted
 * to know more — which is exactly the right audience for it.
 *
 * ── The FAQ is structured data, and it is real questions ─────────────────
 *
 * Each one is something a person actually arrives wanting to know: is there
 * an account, does it work on a phone, does it cost anything. A `FAQPage`
 * block whose questions were invented to hold keywords is the thing Google's
 * own guidance on structured data spam is about, so these are the questions
 * and these are the honest answers.
 */

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Do I need an account to play?",
    a:
      "No. Every course, the race and all the arcade cabinets open without " +
      "signing in. An account exists so your best times, your coins and the " +
      "characters you have bought follow you between devices — it is not a " +
      "gate in front of the game.",
  },
  {
    q: "Does it work on a phone?",
    a:
      "Yes. The same build runs on a phone and a laptop, with on-screen thumb " +
      "controls instead of a keyboard. Phones are held to 60 frames a second " +
      "deliberately: a 120 Hz panel rendering a voxel world does twice the GPU " +
      "work, gets hot, and then throttles to below 60, so the cap is faster " +
      "than no cap.",
  },
  {
    q: "Is there anything to download or install?",
    a:
      "No. A link opens the game. It can be installed as an app if you would " +
      "rather have an icon on your home screen, but that is a convenience " +
      "and nothing needs it.",
  },
  {
    q: "Does it cost anything?",
    a:
      "No. Nothing on the site is paid for with real money. Coins are earned " +
      "by playing, they buy characters, and they convert to nothing — you " +
      "cannot buy them and you cannot cash them out.",
  },
  {
    q: "Where do the medal times come from?",
    a:
      "Each course is solved for the fastest route its geometry physically " +
      "admits, and the Author time is that floor scaled by one constant. The " +
      "medals are therefore measurements of the course rather than guesses, " +
      "and a course cannot be edited into one whose times are impossible.",
  },
];

export function SiteIntro() {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-xl font-bold">
          What {SITE_NAME} is
        </h2>
        <div className="text-dim flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            A platformer that runs in a browser tab. There are{" "}
            {COURSE_COUNT} parkour courses on a difficulty ladder, a lap racer
            with bikes on a neon loop, and an arcade of {CABINET_COUNT} small
            games in cabinets you walk up to inside the world. No download, no
            store, no account needed to start.
          </p>
          <p>
            Every course is timed. Finish one and you get a medal and a ghost
            of the run — a replay of yourself that you then race against on the
            next attempt, which is a far better opponent than a number. Coins
            earned from playing buy characters, and they buy nothing else;
            there is no real money anywhere on this site.
          </p>
          <p>
            It is built and published by{" "}
            <Link href="/about" className="text-accent underline">
              {OWNER_NAME}
            </Link>
            , and everything in it — the courses, the characters, the track,
            the music the cabinets play — was made from scratch rather than
            bought in.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-xl font-bold">How the ladder works</h2>
        <div className="text-dim flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            The {COURSE_COUNT} courses run {TIERS.join(" → ")}, in the order
            they are meant to be played. The tiers are not a difficulty score
            attached afterwards — each one names what the course is asking for,
            and the course is built to ask for it. Tutorial courses teach the
            jump. Medium courses teach you to turn. Expert courses spend the
            full design margin, and the Obby tier replaces small landings with
            lava.
          </p>
          <p>
            No jump anywhere is built by eye. Every gap is designed against{" "}
            <span className="num text-ink">
              {Math.round(DESIGN_MARGIN * 100)}%
            </span>{" "}
            of what the character can physically clear, because a jump at 100%
            is a frame-perfect input and a course full of those is not hard, it
            is unfair. Every course is then proved finishable by a solver —
            including from every checkpoint, since a resume point you cannot
            continue from is a soft lock rather than a mercy.
          </p>
          <p>
            <Link
              href="/how-courses-are-made"
              className="text-accent underline"
            >
              How the courses are made
            </Link>{" "}
            explains all of it, and every course has{" "}
            <Link href="/parkour" className="text-accent underline">
              its own guide
            </Link>{" "}
            with the measured shape of its route.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-xl font-bold">Questions</h2>
        <dl className="flex flex-col gap-4">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="flex flex-col gap-1">
              <dt className="text-ink text-sm font-semibold">{q}</dt>
              <dd className="text-dim text-sm leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            founder: { "@type": "Person", name: OWNER_NAME },
          },
        }}
      />
    </div>
  );
}
