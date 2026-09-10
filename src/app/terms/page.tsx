import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader } from "@/components/PageShell";
import { CONTACT_EMAIL, OWNER_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Terms of use.
 *
 * ── Plain language, and only about things this site does ─────────────────
 *
 * The same rule the privacy policy is written under: a generated terms page
 * full of clauses about subscriptions, refunds and arbitration would describe
 * a business that does not exist here, on the one page whose entire value is
 * that it can be trusted. What follows covers what the site actually offers —
 * free games, an account that holds progress, worlds people build, and coins
 * that buy characters and are worth nothing outside the game.
 *
 * This is not legal advice, and it is not pretending to be. If real money
 * starts moving through the site, it needs somebody qualified.
 *
 * The leaderboard clause is the one worth reading twice. `lib/medals.ts`
 * refuses times under a course's own route floor, and its comment is explicit
 * that this is a guard against a hand-written `fetch` rather than anti-cheat —
 * so this page says what the software does rather than promising enforcement
 * nobody has built.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Terms of Use · ${SITE_NAME}`,
  description: `The terms under which you can use ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/terms` },
};

/** Kept in one place so the prose and the date below cannot drift apart. */
const UPDATED = "10 September 2026";

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

export default function TermsPage() {
  return (
    <PageShell width="prose">
      <PageHeader title="Terms of Use">
        <p className="hud-label num">Last updated {UPDATED}</p>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <Section title="The short version">
          <p>
            The games are free. Play them, build things, and don&apos;t break
            them for anybody else. Everything below is that, said carefully.
          </p>
        </Section>

        <Section title="Using the site">
          <p>
            {SITE_NAME} is free to play and provided as it is, without warranty
            of any kind. I do not promise it will always be available, that
            every course will stay exactly as it is today, or that saved
            progress can never be lost — this is a game run by one person, and
            an honest promise is a small one.
          </p>
        </Section>

        <Section title="Your account and your progress">
          <p>
            You can play without an account. If you make one, it holds your
            times, medals, coins, characters and any worlds you have built.
            What happens to that data is covered by the{" "}
            <Link href="/privacy" className="text-accent underline">
              privacy policy
            </Link>
            , including how to delete it.
          </p>
          <p>
            Coins are part of the game. They are earned by playing, they buy
            characters, and they have no value outside {SITE_NAME}: they cannot
            be bought, sold, transferred or exchanged for money.
          </p>
        </Section>

        <Section title="Worlds you build">
          <p>
            A world you build in the editor stays yours. By publishing one so
            that other people can play or remix it, you allow it to be shown
            and played here — nothing more. You can delete it, and deleting it
            removes it from the gallery.
          </p>
          <p>
            Don&apos;t upload anything you do not have the right to, and
            don&apos;t build anything designed to harass somebody. I can remove
            a world that breaks either rule.
          </p>
        </Section>

        <Section title="Fair play">
          <p>
            Please don&apos;t attempt to disrupt the service, interfere with
            other players&apos; sessions, or reach data that is not yours.
          </p>
          <p>
            Leaderboard times are submitted by your browser and checked against
            what the course makes physically possible, which catches the
            obvious cases and is not proof against a determined one. Times that
            are clearly fabricated get removed. If you find a way to submit a
            nonsense time, the useful thing to do with it is{" "}
            <Link href="/contact" className="text-accent underline">
              tell me
            </Link>
            .
          </p>
        </Section>

        <Section title="Advertising">
          <p>
            The site shows ads to pay for running it. What those ads collect
            and how to turn off personalisation is in the{" "}
            <Link href="/privacy" className="text-accent underline">
              privacy policy
            </Link>
            .
          </p>
        </Section>

        <Section title="Ownership">
          <p>
            The games, code, artwork and writing here are the work of{" "}
            {OWNER_NAME} unless stated otherwise, and are not to be
            redistributed or resold without permission. Recording or streaming
            yourself playing is fine and always will be.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            To the extent the law allows, I am not liable for any loss or
            damage arising from use of this site — including lost progress or
            time the site was unavailable.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms may change. The date at the top is when they last did.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about any of this:{" "}
            <a
              className="text-accent underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </PageShell>
  );
}
