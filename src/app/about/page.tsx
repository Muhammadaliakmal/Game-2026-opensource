import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader } from "@/components/PageShell";
import { hasPosts } from "@/lib/blog";
import {
  CONTACT_EMAIL,
  OWNER_LOCATION,
  OWNER_NAME,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

/**
 * Who publishes this site.
 *
 * ── Why a games site needs a page about a person ─────────────────────────
 *
 * An ad review is an assessment of a *publisher*, and a bare game canvas has
 * no publisher visible anywhere in it. This page is the one that says a named
 * human in a named city is responsible for what is here and can be written to
 * — which is the thing being checked, and the thing a domain full of WebGL
 * cannot express on its own.
 *
 * ── Every claim on this page is checkable ────────────────────────────────
 *
 * The temptation on an About page is player counts and launch dates. There
 * are none here, because there are none to have: what it describes is the
 * software in this repository, which anybody can verify by playing it. A
 * number nobody can check is worth less than a sentence they can.
 *
 * `force-static`: it depends on nothing per-request, and the crawler that
 * matters should get it without a database round trip.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `About · ${SITE_NAME}`,
  description: `${SITE_NAME} is a browser game built by ${OWNER_NAME}, a full-stack engineer in ${OWNER_LOCATION}.`,
  alternates: { canonical: `${SITE_URL}/about` },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink text-lg font-bold">{title}</h2>
      <div className="text-dim flex flex-col gap-2 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <PageShell width="prose">
      <PageHeader title="About">
        <p className="text-dim text-sm">
          Who makes {SITE_NAME}, what it is built with, and how to reach me.
        </p>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <Section title="Who">
          <p>
            I&apos;m {OWNER_NAME}, a full-stack engineer based in{" "}
            {OWNER_LOCATION}. I build web applications and browser games, and
            this site is where I publish the games.
          </p>
        </Section>

        <Section title="What this is">
          <p>
            {SITE_NAME} is a browser game. There are five parkour courses on a
            difficulty ladder, a lap racer, an arcade of small games in
            cabinets you walk up to, and an editor for building courses of your
            own. It runs in a tab: no download, no store, no install — though
            it can be{" "}
            <Link href="/download" className="text-accent underline">
              installed as an app
            </Link>{" "}
            if you would rather have an icon.
          </p>
          <p>
            Everything you can see was built from scratch rather than bought in
            — the courses, the characters, the track, the music the cabinets
            play. That is a deliberate constraint and not a boast: it is the
            only way to know why every part of it behaves the way it does.
          </p>
        </Section>

        <Section title="How it is built">
          <p>
            Next.js and React, with React Three Fiber over three.js for the 3D,
            Rapier for physics, and a plain 2D canvas for the arcade cabinets.
            Multiplayer rooms run on a separate Node server, because a game
            room has to stay resident and a serverless function does not.
          </p>
          <p>
            The reason for the web rather than an engine is the same reason the
            site has no install step: a link opens a game. No download, no
            store review, and it works the same on a phone as on a laptop.
            What that costs is a lower ceiling on how much can be loaded before
            somebody gives up waiting, which is a constraint that shapes most
            of the decisions here.
          </p>
        </Section>

        {/* Gated on there being something to read. A link to an empty blog is
            a worse advertisement for a blog than no link, and `hasPosts` is
            the one fact the footer and the sitemap ask as well — so the whole
            thing appears together the moment a post is written. */}
        {hasPosts() && (
          <Section title="Writing">
            <p>
              I write about how the games get built — the decisions, the level
              design, and what I got wrong and had to redo. Those notes are on
              the{" "}
              <Link href="/blog" className="text-accent underline">
                blog
              </Link>
              .
            </p>
          </Section>
        )}

        <Section title="Contact">
          <p>
            Bug reports, feedback on a course, or anything else:{" "}
            <a
              className="text-accent underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            . There is also a{" "}
            <Link href="/contact" className="text-accent underline">
              contact page
            </Link>
            .
          </p>
        </Section>
      </div>
    </PageShell>
  );
}
