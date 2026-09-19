import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PageHeader } from "@/components/PageShell";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { ControlTable } from "@/components/guide/Controls";
import { FOOT_CONTROLS, TOUCH_CONTROLS, RIDE_CONTROLS } from "@/content/controls";
import { CABINET_NOTES } from "@/content/cabinet-notes";
import { ARCADE } from "@/arcade/registry";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Every control in the game, at one address.
 *
 * ── Why this is its own page ─────────────────────────────────────────────
 *
 * Two reasons, and the second one is the reason it was built now.
 *
 * The first is that it is a page people look for. "How do I sprint" is a
 * question asked away from the game, on a phone, by somebody who is not going
 * to find the answer on a canvas that only shows a keyboard legend to
 * keyboards.
 *
 * The second is arithmetic. The full controls table was rendered on all
 * twenty-seven course and world guides, which made about 180 identical words
 * on pages whose own content is roughly 250. Repeating a third of every page
 * across twenty-seven of them is the shape of a templated site whatever the
 * other two thirds say. The guides now carry the three controls somebody
 * needs to start and link here for the rest, which is better for a reader as
 * well — the full table was never what they wanted mid-sentence.
 *
 * Everything here is data from `content/controls.ts` and `arcade/registry.ts`,
 * so a rebound default or a changed cabinet hint changes this page too.
 */
export const dynamic = "force-static";

const TITLE = "Controls";
const SUMMARY =
  "Every control in the game: keyboard and touch on foot, the bike, and all " +
  "nine arcade cabinets. Every key is rebindable in settings.";

export const metadata: Metadata = {
  title: `${TITLE} — keyboard and touch · ${SITE_NAME}`,
  description: SUMMARY,
  alternates: { canonical: `${SITE_URL}/controls` },
  openGraph: {
    title: `${TITLE} · ${SITE_NAME}`,
    description: SUMMARY,
    url: `${SITE_URL}/controls`,
    type: "article",
  },
};

export default function ControlsPage() {
  return (
    <PageShell width="prose">
      <Breadcrumbs
        trail={[
          { href: "/", label: SITE_NAME },
          { href: "/games", label: "Games" },
          { href: "/controls", label: TITLE },
        ]}
      />

      <PageHeader title={TITLE} back={null}>
        <p className="text-dim max-w-xl text-sm">{SUMMARY}</p>
      </PageHeader>

      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <h2 className="text-ink text-lg font-bold">
            On foot — parkour and the sandbox worlds
          </h2>
          <p className="text-dim text-sm leading-relaxed">
            These apply on every parkour course and in every sandbox world.
            The one that surprises people is sprint: it is a{" "}
            <strong className="text-ink">latch, not a hold</strong>. Tap Shift
            once and sprint stays on, along with a camera lock-on, until you
            tap it again. Holding it down does nothing extra, and neither
            sprint nor the lock-on carries over into the next world you open.
          </p>
          <ControlTable caption="On foot — keyboard" rows={FOOT_CONTROLS} />
          <ControlTable caption="On foot — touch" rows={TOUCH_CONTROLS} />
          <p className="text-dim text-xs leading-relaxed">
            Respawn and restart are deliberately not next to each other on the
            keyboard. Respawn costs you a checkpoint&apos;s worth of progress
            and restart costs the whole run, and the two should not be one
            finger apart on a key you press while falling.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-ink text-lg font-bold">On the bike — race mode</h2>
          <p className="text-dim text-sm leading-relaxed">
            The race is a different control set, not the walking one with a
            vehicle under it. Space is the handbrake here, which is the same
            key that jumps on foot — the one control both modes agree means
            &ldquo;stop what you are doing&rdquo;. Drifting is how the boost
            meter fills, so the fast line and the tidy line are not the same
            line.
          </p>
          <ControlTable caption="On the bike — keyboard" rows={RIDE_CONTROLS} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-ink text-lg font-bold">Arcade cabinets</h2>
          <p className="text-dim text-sm leading-relaxed">
            Each cabinet has one or two controls and no more — they are
            ninety-second games, and a cabinet that needed a manual would be
            the wrong kind of cabinet. Both inputs are listed because the
            in-game hint shows only the one your device has.
          </p>
          <div className="flex flex-col gap-4">
            {ARCADE.filter((c) => !c.dev).map((cab) => (
              <div key={cab.id} className="flex flex-col gap-1">
                <h3 className="text-ink text-sm font-semibold">
                  <Link
                    href={`/games/${cab.id}`}
                    className="text-accent underline"
                  >
                    {cab.title}
                  </Link>
                </h3>
                <p className="text-dim text-xs">
                  <span className="text-ink">Keyboard:</span> {cab.hint.keys}
                </p>
                <p className="text-dim text-xs">
                  <span className="text-ink">Touch:</span> {cab.hint.touch}
                </p>
                {CABINET_NOTES[cab.id] && (
                  <p className="text-dim text-xs leading-relaxed">
                    {CABINET_NOTES[cab.id].approach}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-lg font-bold">Rebinding</h2>
          <p className="text-dim text-sm leading-relaxed">
            Every key above is a default, not a fixture. Settings → Controls
            lets you rebind any action, with up to three keys each, and offers
            presets for the common layouts. A few keys are refused on purpose —
            the browser owns them, and a binding that works until the day it
            does not is worse than no binding.
          </p>
          <p className="text-dim text-sm leading-relaxed">
            If you want to know what the controls are actually asking you to do
            rather than which key does it, every course has{" "}
            <Link href="/games" className="text-accent underline">
              a guide
            </Link>
            , and{" "}
            <Link
              href="/how-courses-are-made"
              className="text-accent underline"
            >
              how the courses are made
            </Link>{" "}
            explains the jump the controls are built around.
          </p>
        </section>

        <AdSlot placement="guide" />
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: `${TITLE} — ${SITE_NAME}`,
          description: SUMMARY,
          url: `${SITE_URL}/controls`,
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
