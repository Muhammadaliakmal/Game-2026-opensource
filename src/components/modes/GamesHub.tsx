import Link from "next/link";
import { ModeCard } from "./ModeCard";
import { ContinueChip } from "./ContinueChip";
import { CabinetPreview } from "@/components/arcade/CabinetPreview";
import { CABINETS } from "@/arcade/registry";
import { PARKOUR_COURSES, SANDBOX_WORLDS } from "@/lib/built-in-worlds";
import { MAX_RIDERS, RACE_LAPS } from "@/lib/race-track";

/**
 * Every game, on one screen, one press from playing.
 *
 * ── What was wrong ───────────────────────────────────────────────────────
 *
 * The front page offered two of the four modes. The arena was on no page and
 * in no menu — it was reachable by typing `/arena`. The arcade was a word in
 * the header, and its four games were a page further behind that with no
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
 *  2. The three modes, as covers. Parkour first (works alone, offline, no
 *     code needed), then Race, then Arena, both of which need a room.
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
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">{heading}</h2>
          <ContinueChip />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ModeCard
            href="/parkour"
            art="parkour"
            eyebrow={`${PARKOUR_COURSES.length} courses · Tutorial to Expert`}
            title="Parkour"
            blurb="Jump it, time it, take the medal. A ghost of your best run is out there ahead of you."
            meta={["Solo", "Medals", "Ghosts"]}
            cta="Choose a course"
          />
          <ModeCard
            href="/race"
            art="race"
            eyebrow={`Up to ${MAX_RIDERS} riders · ${RACE_LAPS} laps`}
            title="Race"
            blurb="Bikes on a neon loop. Drift to fill the boost, spend it down the straight, send the code to your friends."
            meta={["Multiplayer", "Boost", "Drift"]}
            cta="Open a grid"
          />
          <ModeCard
            href="/arena"
            art="arena"
            eyebrow="Two players · First to five"
            title="Arena"
            blurb="One world, one opponent. Land five knockdowns to win. Open a match and send the link."
            meta={["Multiplayer", "Duel", "Any world"]}
            cta="Open a match"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Arcade</h2>
          <Link href="/arcade" className="hud-label hover:text-accent">
            All cabinets →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {CABINETS.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/arcade?play=${entry.id}`}
                className="group card hover:border-accent/70 focus-visible:border-accent/70 block overflow-hidden transition-colors"
              >
                <div className="relative aspect-[5/3] w-full overflow-hidden bg-[#0b1030]">
                  <CabinetPreview id={entry.id} />
                </div>
                <div className="flex flex-col gap-0.5 p-3">
                  <h3 className="text-ink truncate text-sm font-semibold">{entry.title}</h3>
                  <p className="text-dim line-clamp-2 text-xs">{entry.tagline}</p>
                  <span className="hud-chip hud-chip--primary group-hover:brightness-110 mt-2 w-fit">
                    Play
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Worlds to explore</h2>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {SANDBOX_WORLDS.map((w) => (
            <li key={w.slug}>
              {/* The whole card is the link, as with the modes: a Play chip
                  under a paragraph made the paragraph the part that was not
                  pressable. */}
              <Link
                href={`/play/${w.slug}`}
                className="group card hover:border-accent/70 focus-visible:border-accent/70 flex h-full flex-col p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-ink text-base font-semibold">{w.name}</h3>
                  <span className="hud-label shrink-0">Built-in</span>
                </div>
                <p className="text-dim mt-1 flex-1 text-sm">{w.blurb}</p>
                <span className="hud-chip hud-chip--primary group-hover:brightness-110 mt-4 w-fit">
                  Play
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
