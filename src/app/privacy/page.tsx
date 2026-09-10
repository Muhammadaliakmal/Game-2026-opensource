import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * The privacy policy.
 *
 * ── Why this page exists at all ──────────────────────────────────────────
 *
 * It is a hard requirement of the AdSense programme policies, not a courtesy:
 * a site serving Google ads has to disclose that third parties set cookies,
 * name Google as one of them, and point at the opt-outs. An application
 * without a reachable policy is refused, and the refusal does not say which
 * of the several possible reasons it was.
 *
 * ── Why it is prose and not a generator's template ───────────────────────
 *
 * A policy that describes data the app does not collect is worse than a short
 * one: it is a claim nobody checked, on the one page whose whole value is
 * that it can be trusted. So this says what this app actually does — Clerk
 * holds the account, Neon holds the times and coins, Google serves the ads —
 * and nothing more. If a vendor is added, this page is part of that change.
 *
 * `dynamic = "force-static"`: it depends on nothing per-request, and the
 * crawler that matters here should get it without a database round trip.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy · Blockworld",
  description:
    "What Blockworld stores, which third parties it uses, and how advertising cookies work.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

/** Kept in one place so the prose and the <time> below cannot drift apart. */
const UPDATED = "9 September 2026";

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

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="hud-label text-accent mb-6 inline-block">
        ← {SITE_NAME}
      </Link>

      <h1 className="text-display text-ink mb-2 font-bold">Privacy Policy</h1>
      <p className="hud-label num mb-10">Last updated {UPDATED}</p>

      <div className="flex flex-col gap-8">
        <Section title="The short version">
          <p>
            {SITE_NAME} is a browser game. You can play it without an account.
            If you make one, we store what is needed to keep your progress —
            your times, your coins and which character you are wearing — and
            nothing else. We do not sell your data, and there is no tracking
            here beyond the advertising described below.
          </p>
        </Section>

        <Section title="What is stored">
          <p>
            <strong className="text-ink">Without an account:</strong> nothing
            that identifies you is kept on our servers. Some settings, such as
            whether sound is muted, are saved in your own browser and never
            leave it.
          </p>
          <p>
            <strong className="text-ink">With an account:</strong> your sign-in
            is handled by Clerk, which holds your email address and, if you
            used one, the identity of the provider you signed in with (for
            example Google). Our own database stores your user id together with
            your course times, medals, coin balance, characters owned, and any
            worlds you have made.
          </p>
        </Section>

        <Section title="Advertising and cookies">
          <p>
            This site shows ads served by Google AdSense. Google and its
            partners use cookies to serve ads based on your prior visits to
            this and other websites, and to measure whether an ad was seen.
          </p>
          <p>
            You can turn off personalised advertising in{" "}
            <a
              className="text-accent underline"
              href="https://myadcenter.google.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Ad Settings
            </a>
            , and opt out of a wider set of vendors at{" "}
            <a
              className="text-accent underline"
              href="https://www.aboutads.info/choices/"
              target="_blank"
              rel="noopener noreferrer"
            >
              aboutads.info
            </a>
            . Turning personalisation off does not remove ads; it makes them
            less relevant. Google&apos;s own description of what it collects is
            in its{" "}
            <a
              className="text-accent underline"
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
            >
              partner sites policy
            </a>
            .
          </p>
        </Section>

        <Section title="Who else sees anything">
          <p>
            Three services, each doing one job:{" "}
            <strong className="text-ink">Clerk</strong> for sign-in,{" "}
            <strong className="text-ink">Neon</strong> for the database that
            holds progress, and{" "}
            <strong className="text-ink">Google AdSense</strong> for the ads.
            Nobody else receives your data, and none of it is sold.
          </p>
        </Section>

        <Section title="Children">
          <p>
            {SITE_NAME} is a general-audience game. It is not directed at
            children under 13, and we do not knowingly collect personal
            information from them. If you believe a child has given us
            information, contact us and it will be removed.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can delete your account at any time, which removes your times,
            coins and worlds along with it. You can also clear this site&apos;s
            cookies and local storage in your browser, which resets anything
            saved on your device.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy, or a request to delete data, go to{" "}
            <a className="text-accent underline" href="mailto:privacy@specdrivengames.com">
              privacy@specdrivengames.com
            </a>
            .
          </p>
        </Section>
      </div>

      <SiteFooter />
    </div>
  );
}
