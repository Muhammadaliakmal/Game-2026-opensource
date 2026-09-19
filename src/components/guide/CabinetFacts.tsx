import { ARCADE } from "@/arcade/registry";
import { RATES, DAILY_SOFT_CAP } from "@/lib/arcade-payout";
import { bySlug } from "@/content/registry";

/**
 * The measured side of a cabinet, and where it sits among the other eight.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * A course guide carries a solved route, a ladder ranking and four medal
 * times. A cabinet has none of those, so the cabinet guides came out at
 * roughly 300 words against the courses' 560 — the thinnest pages in the
 * sitemap, which is the one place thinness still mattered after the rest of
 * the content pass.
 *
 * The answer is not padding. It is that a cabinet does have measurable
 * properties and they were simply not on the page: what it pays, what that
 * rate implies about whether it can be farmed, whether it reports a score at
 * all, and how fast its music runs — which is a real design parameter here
 * rather than trivia, because a cabinet is allowed its own tempo and nothing
 * else about its track.
 *
 * ── The rate ranking is the part that could not be written twice ─────────
 *
 * Every cabinet's rate is compared against the other eight at render, so the
 * sentence about it is different on all nine pages and is arithmetic rather
 * than opinion. `RATES` is the same constant the payout route reads, so a
 * rate that changes changes this page.
 */

/** Cabinets a player can actually open — the host's test game is not one. */
const REAL = ARCADE.filter((c) => !c.dev);

/** Coins the rate implies for a given score, for the worked example below. */
const EXAMPLE_SCORE = 1_000;

export function CabinetFacts({ slug }: { slug: string }) {
  const entry = ARCADE.find((c) => c.id === slug);
  if (!entry) return null;

  const rate = RATES[slug] ?? 0;
  const registry = bySlug.get(slug);

  // Where this rate sits among the nine. Ties are common — three puzzle
  // cabinets share 0.2 — so this counts distinct rates rather than claiming a
  // position it shares with two others.
  const rates = [...new Set(REAL.map((c) => RATES[c.id] ?? 0))].sort(
    (a, b) => b - a
  );
  const band = rates.indexOf(rate) + 1;
  const sharers = REAL.filter((c) => (RATES[c.id] ?? 0) === rate).length;

  const rows: Array<[string, string]> = [];
  if (rate > 0) {
    rows.push(["Pays", `${rate} coins per point`]);
    rows.push([
      `At ${EXAMPLE_SCORE.toLocaleString()} points`,
      `${Math.round(EXAMPLE_SCORE * rate).toLocaleString()} coins`,
    ]);
  }
  rows.push([
    "Reports",
    entry.board ? "A placement, not a score" : "A running score",
  ]);
  if (entry.bpm) rows.push(["Music", `${entry.bpm} BPM`]);
  if (registry) {
    rows.push(["Tagged", registry.tags.join(", ")]);
    rows.push(["Added", registry.addedAt]);
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink text-lg font-bold">By the numbers</h2>
      <table className="w-full max-w-sm text-left text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr
              key={label}
              className="border-b border-[var(--border-color)]/50"
            >
              <th scope="row" className="text-dim py-2 font-normal">
                {label}
              </th>
              <td className="num text-ink py-2">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-dim flex flex-col gap-3 text-sm leading-relaxed">
        {rate > 0 ? (
          <p>
            That is the{" "}
            {band === 1
              ? "highest rate in the arcade"
              : band === rates.length
                ? "lowest rate in the arcade"
                : `${band === 2 ? "second" : band === 3 ? "third" : `${band}th`}-highest of the ${rates.length} rates in use`}
            {sharers > 1
              ? `, shared with ${sharers - 1} other cabinet${sharers > 2 ? "s" : ""}`
              : ""}
            . The rates are not arbitrary: a cabinet with a natural ceiling
            pays more per point than one you can play forever, because the
            second kind can be farmed by playing longer and the first can only
            be farmed by playing better.
          </p>
        ) : (
          <p>
            This cabinet pays nothing. It is here to be played rather than
            earned from.
          </p>
        )}
        {entry.bpm && (
          <p className="text-xs">
            The tempo is a design parameter rather than decoration. A cabinet
            is allowed its own BPM and nothing else about its music, because
            tempo is the one musical thing a game has an opinion about — a
            game played in bursts wants a different pulse from one played in a
            held breath. At {entry.bpm} this is{" "}
            {entry.bpm >= 130
              ? "at the fast end of the arcade"
              : entry.bpm <= 112
                ? "among the slowest here, deliberately"
                : "in the middle of the range"}
            .
          </p>
        )}
        {rate > 0 && (
          <p className="text-xs">
            Payouts are computed on the server, not in your browser — a balance
            the page holds is a balance a player can edit. The first{" "}
            <span className="num">{DAILY_SOFT_CAP}</span> coins a day come at
            full rate and everything after that at a fifth.
          </p>
        )}
      </div>
    </section>
  );
}
