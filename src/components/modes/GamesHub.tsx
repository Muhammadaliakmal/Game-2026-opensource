import Link from "next/link";
import { ModeCard } from "./ModeCard";
import { ContinueChip } from "./ContinueChip";
import { DailyChallenge } from "./DailyChallenge";
import { GameSearch } from "./GameSearch";
import { WorldCard } from "./WorldCard";
import { CabinetPreview } from "@/components/arcade/CabinetPreview";
import { CABINETS } from "@/arcade/registry";
import { PARKOUR_COURSES, SANDBOX_WORLDS } from "@/lib/built-in-worlds";
import { MAX_RIDERS, RACE_LAPS } from "@/lib/race-track";
import { StatBadge } from "@/components/stats/StatBadge";
import { RACE } from "@/lib/features";

/**
 * Every game, on one screen, one press from playing.
 *
 * ── What was wrong ───────────────────────────────────────────────────────
 *
 * The front page offered two of the modes. The arcade was a word in the
 * header, and its four games were a page further behind that with no
 * address of their own. A visitor who wanted "everything I can play here"
 * had to know it existed first. That is the opposite of a front page.
 *
 * ── What this is ─────────────────────────────────────────────────────────
 *
 * One component, in one order, used by the home page (both halves) and by
 * `/games`, so there is exactly one list of what this site has and it
 * cannot disagree with itself:
 *
 *  1. Continue — the last thing you played, if anything. Most visits are
 *     return visits, and a returning player wants the game, not the menu.
 *     Under it, today's challenge: the one thing that is different about
 *     the site today, and so the one reason to have come back today.
 *  2. The two modes, as covers. Parkour first (works alone, offline, no
 *     code needed), then Race, which needs a room. There was an arena — a
 *     two-player knockdown duel — between them; it was cut in September
 *     2026, and with it went the third column.
 *  3. The arcade, cabinet by cabinet. Each tile is a link to
 *     `/arcade?play=<id>`, which opens that game on arrival — so a cabinet is
 *     one press from here rather than two pages away.
 *  4. The worlds with nothing to complete. Somewhere to stand.
 *
 * `id="games"` so the header's Games link and the hero can jump to it.
 */
export function GamesHub({ heading = "Play" }: { heading?: string }) {
  return (
    <div id="games" className="flex scroll-mt-20 flex-col gap-8 sm:gap-10">
      <section className="rise-in flex flex-col gap-4" style={{ "--rise-i": 0 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">{heading}</h2>
          <ContinueChip />
          {/* Right-aligned on a wide screen, full width under the heading on a
              phone. Every game on the site is in its index, and worlds
              people made arrive from the server as you type. */}
          <div className="w-full sm:ml-auto sm:w-auto sm:flex-1 sm:max-w-md">
            <GameSearch />
          </div>
        </div>
        <DailyChallenge />
        <div className="grid gap-4 sm:grid-cols-2 sm:[&>*:only-child]:col-span-2">
          <ModeCard
            href="/parkour"
            art="parkour"
            eyebrow={`${PARKOUR_COURSES.length} courses · Tutorial to Obby`}
            title="Parkour"
            blurb="Jump it, time it, take the medal. A ghost of your best run is out there ahead of you — and one course is lava."
            meta={["Solo", "Medals", "Ghosts", "Obby"]}
            cta="Choose a course"
          />
          {RACE && <ModeCard
            href="/race"
            art="race"
            eyebrow={`Up to ${MAX_RIDERS} riders · ${RACE_LAPS} laps`}
            title="Race"
            blurb="Bikes on a neon loop. Drift to fill the boost, spend it down the straight, send the code to your friends."
            meta={["Multiplayer", "Boost", "Drift"]}
            cta="Open a grid"
          />}
        </div>
      </section>

      <section className="rise-in flex flex-col gap-4" style={{ "--rise-i": 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Arcade</h2>
          <Link href="/arcade" className="hud-label hover:text-accent">
            All cabinets →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {CABINETS.map((entry) => (
            <li key={entry.id}>
              {/* A stretched link, not a link around the tile: the badge
                  carries a <button>, and one cannot be nested in an <a>.
                  See globals.css. */}
              {/* A game tile (globals.css `.card`) in the cabinet's own
                  colour, with its name set on its picture the way a game's
                  menu labels a mode — not a picture with a caption under it. */}
              <article
                className="group card card-linked h-full overflow-hidden"
                style={{ "--card-hue": entry.hue, "--card-hue-ink": "#0a0a0f" } as React.CSSProperties}
              >
                <div className="art-box relative aspect-[5/3] w-full overflow-hidden bg-[var(--art-backdrop,#0b1030)]">
                  <CabinetPreview id={entry.id} />
                  <h3
                    className="art-title art-title--fit absolute inset-x-3 bottom-2 truncate"
                    style={{ "--len": entry.title.length } as React.CSSProperties}
                  >
                    <Link href={`/arcade?play=${entry.id}`} className="stretched-link">
                      {entry.title}
                    </Link>
                  </h3>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <p className="text-dim line-clamp-2 text-xs">{entry.tagline}</p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="hud-chip hud-chip--primary w-fit">Play</span>
                    <StatBadge slug={entry.id} />
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section className="rise-in flex flex-col gap-4" style={{ "--rise-i": 2 } as React.CSSProperties}>
        <h2 className="text-xl font-bold">Worlds to explore</h2>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {SANDBOX_WORLDS.map((w) => (
            <li key={w.slug}>
              {/* The whole card is the link, as with the modes: a Play chip
                  under a paragraph made the paragraph the part that was not
                  pressable. */}
              <WorldCard
                slug={w.slug}
                name={w.name}
                blurb={w.blurb}
                href={`/play/${w.slug}`}
                badge="Built-in"
                // A built-in world IS a registry entry, and its slug is the
                // same string in both places — which is what the drift test
                // in `content/registry.test.ts` is there to keep true.
                statSlug={w.slug}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
