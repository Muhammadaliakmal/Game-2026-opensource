import type { WorldFacts } from "@/content/course-facts";

/**
 * The measured shape of a world, as a table.
 *
 * ── Why a table and not a paragraph ──────────────────────────────────────
 *
 * Because these are the facts a reader came to compare. Somebody deciding
 * between Spindle and Arc Light wants the drop and the gap side by side, and
 * a paragraph makes them hold six numbers in their head to do it. The prose
 * on the page explains what the numbers mean; this is the numbers.
 *
 * ── The footnote is not decoration ───────────────────────────────────────
 *
 * The route figures come from a solver that walks surfaces with no air
 * control and no momentum. It is a sound lower bound on the time and a sound
 * upper bound on what is reachable, and it is NOT what a human does — a
 * player takes more jumps than `jumps` and a different line. Publishing the
 * numbers without saying that would be publishing something subtly false,
 * which is worse than publishing nothing.
 */
export function Facts({
  slug,
  facts,
}: {
  slug: string;
  facts: WorldFacts;
}) {
  const rows: Array<[string, string]> = [
    ["Blocks", facts.parts.toLocaleString()],
    ["Footprint", `${facts.spanX} × ${facts.spanZ} cells`],
    ["Height", `${facts.spanY} cells`],
  ];

  if (facts.checkpoints > 0) {
    rows.push(["Checkpoints", String(facts.checkpoints)]);
  }
  if (facts.hazards > 0) {
    rows.push(["Hazard blocks", facts.hazards.toLocaleString()]);
  }
  if (facts.route) {
    const r = facts.route;
    rows.push(
      ["Jumps on the solved route", String(r.jumps)],
      ["Widest gap", `${r.longestGap} cells`],
      ["Total climb", `${r.climb} cells`],
      ["Start to finish", `${r.netRise >= 0 ? "+" : ""}${r.netRise} cells`]
    );
    if (r.biggestDrop > 0) {
      rows.push(["Biggest drop", `${r.biggestDrop} cells`]);
    }
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
      <p className="text-dim text-xs leading-relaxed">
        Measured from the geometry the game builds for{" "}
        <span className="num">{slug}</span>, not estimated.
        {facts.route
          ? " Route figures describe the course, not a human run."
          : ""}
      </p>
    </section>
  );
}
