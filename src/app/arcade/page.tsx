import { Suspense } from "react";
import { ArcadeLobby, ArcadeLobbySkeleton } from "@/components/arcade/ArcadeLobby";
import { ArcadeAutoOpen } from "@/components/arcade/ArcadeAutoOpen";
import Link from "next/link";
import { PageShell, PageHeader } from "@/components/PageShell";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { byKind } from "@/content/registry";
import { CABINET_NOTES } from "@/content/cabinet-notes";
import { RATES } from "@/lib/arcade-payout";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { DAILY_HARD_CAP, DAILY_SOFT_CAP } from "@/lib/arcade-payout";
import { CABINET_COUNT } from "@/content/registry";

/**
 * The arcade.
 *
 * Static, like `/parkour` and for the same reason: everything on it comes from
 * code. The cabinet list is a constant, the payout rates are constants, and the
 * one per-player fact on the screen — your best score — lives in the browser
 * and is read by the client component below rather than fetched.
 */
export const metadata = {
  title: `Arcade — ${CABINET_COUNT} cabinets · ${SITE_NAME}`,
  description: `${CABINET_COUNT} cabinets you walk up to inside the world. A run takes under two minutes and eight of them pay coins. No account needed.`,
  /*
   * The canonical is the load-bearing line here, not the title.
   *
   * This page reads THREE query parameters — `?play=` (the hub links one per
   * cabinet, so ten of them), `?sort=` and `?tags=`. Every combination is a
   * URL serving the same lobby, which is how a filter turns into an unbounded
   * set of near-identical pages. That is the "filters that create infinite
   * thin pages" failure by name, and it was live.
   *
   * One canonical collapses all of them onto `/arcade`. The `?play=` links
   * still work and still open the right cabinet; they simply stop being
   * separate pages as far as an index is concerned.
   */
  alternates: { canonical: `${SITE_URL}/arcade` },
};

export default function ArcadePage() {
  return (
    <PageShell>
      <Breadcrumbs
        trail={[
          { href: "/", label: SITE_NAME },
          { href: "/games", label: "Games" },
          { href: "/arcade", label: "Arcade" },
        ]}
      />
      <PageHeader title="Arcade" back={null}>
        <p className="text-dim max-w-xl text-sm">
          Short games, played on a flat screen over the world. A run takes under
          two minutes, and eight of the ten pay coins — the same coins the
          courses pay, buying the same characters. The two board games pay
          nothing and are here to be played rather than earned from.
        </p>
      </PageHeader>

      {/*
        `useSearchParams` needs a Suspense boundary or the whole static page
        falls back to client rendering. The lobby now reads `?sort=` and
        `?tags=` as well, so it is inside one too.

        Its fallback is a card-shaped skeleton rather than nothing. The
        cabinets' art is `<CabinetPreview>`, a canvas that only ever exists in
        the browser, so the grid was never meaningfully in the server HTML to
        begin with — but the SPACE it occupies has to be, or the page paints
        short and everything under it jumps down when the grid arrives. That
        jump is a layout shift, and on this site a layout shift is an AdSense
        question as well as a polish one.

        `ArcadeAutoOpen` renders nothing either way, so its fallback is
        nothing.
      */}
      <Suspense fallback={<ArcadeLobbySkeleton />}>
        <ArcadeLobby />
      </Suspense>
      <Suspense fallback={null}>
        <ArcadeAutoOpen />
      </Suspense>

      {/*
        The words.

        The grid above is `<CabinetPreview>`, a canvas that only ever exists
        in the browser, so everything a crawler gets from this page came from
        the header and the coins note — about a hundred and forty words for a
        page that is one of the four things in the site header. This is the
        same ten cabinets as text, each linking to its own guide.
      */}
      <div className="mt-12 flex max-w-2xl flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-xl font-bold">How the arcade works</h2>
          <div className="text-dim flex flex-col gap-3 text-sm leading-relaxed">
            <p>
              The cabinets are inside the world. You walk up to one and it
              opens on a flat screen over the scene, which is why they are 2D
              games in a 3D game rather than a separate part of the site. Each
              one loads only when you open it — a cabinet is a ninety-second
              game and should not be in the download for a course.
            </p>
            <p>
              Nothing here costs money and nothing can be bought. Coins are
              earned by playing and spent on{" "}
              <Link href="/shop" className="text-accent underline">
                characters
              </Link>
              ; they convert to nothing in either direction. Payouts are
              computed on the server, because a balance held by the browser is
              a balance a player can edit.
            </p>
            <p>
              Two of the nine report a placement rather than a score — Ludo and
              Snakes &amp; Ladders are board games, and a running total during
              a four-minute match would be a readout that is actively wrong
              about what you are doing.
            </p>
          </div>
        </section>

        {/*
          The cabinets as prose, under the grid.

          The names are NOT headings here. The lobby above already renders
          each title as an `<h3>` — it is a client component, but Next server-
          renders it, so those headings are in the HTML — and a second `<h3>`
          with the same words makes the page's outline claim nine sections
          that exist twice. A browser pass caught it; reading the source never
          would, because the two lists are written in different files.

          What this section adds over the grid is the part the grid has no
          room for: what each cabinet actually is, and what it pays. So the
          name is a link inside the sentence rather than a heading over it.
        */}
        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-xl font-bold">What each one is</h2>
          <ul className="flex flex-col gap-3">
            {byKind("arcade").map((cab) => (
              <li key={cab.slug} className="text-dim text-sm leading-relaxed">
                <Link
                  href={`/games/${cab.slug}`}
                  className="text-accent font-semibold underline"
                >
                  {cab.title}
                </Link>
                {RATES[cab.slug] ? (
                  <span className="hud-label num ml-2">
                    {RATES[cab.slug]} coins per point
                  </span>
                ) : (
                  <span className="hud-label ml-2">pays nothing</span>
                )}
                <br />
                {CABINET_NOTES[cab.slug]?.what ?? cab.tagline}
              </li>
            ))}
          </ul>
        </section>

        {/* The payout rule, said once and plainly. A cap a player discovers by
            watching their coins stop is a cap that reads as a bug. */}
        <section className="flex flex-col gap-2">
          <h2 className="text-ink text-xl font-bold">Coins</h2>
          <p className="text-dim max-w-2xl text-sm leading-relaxed">
            A run pays its score times the cabinet&apos;s rate. The first{" "}
            <span className="num">{DAILY_SOFT_CAP}</span> coins a day come at
            full rate and everything after that at a fifth, up to{" "}
            <span className="num">{DAILY_HARD_CAP}</span> a day. Scores and
            best runs keep counting after that — only the payout stops, and it
            slows rather than stopping dead, because a number that freezes
            reads as a bug and a number that slows reads as a rule.
          </p>
          <p className="text-dim max-w-2xl text-sm leading-relaxed">
            The rates are not arbitrary. A cabinet with a natural ceiling pays
            more per point than one you can play forever: Tower Stack narrows
            to nothing however well you play, so it pays two coins a point,
            while Reflex has no end at all and pays a twentieth.
          </p>
        </section>

        <AdSlot placement="guide" />
      </div>
    </PageShell>
  );
}
