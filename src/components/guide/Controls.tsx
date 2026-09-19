import Link from "next/link";
import { FOOT_ESSENTIALS, type ControlRow } from "@/content/controls";
import { ARCADE } from "@/arcade/registry";

/**
 * How you play the thing this page is about.
 *
 * ── Why a guide page carries controls at all ─────────────────────────────
 *
 * Because the game does not, for the reader this page is for. The in-game
 * legend appears on a canvas, after a load, and only on a keyboard — so
 * somebody who arrived from a search result and is deciding whether to press
 * play has no way to find out what they would be pressing.
 *
 * ── Why it is three rows and not the whole table ─────────────────────────
 *
 * The full table used to render here, identically, on all twenty-seven course
 * and world guides. That is about 180 repeated words on pages whose own
 * content is around 250 — a third of every page shared across twenty-seven of
 * them, which is the shape of a templated site whatever the rest says.
 *
 * It is also the wrong thing for the reader. Somebody halfway through an
 * article about one course wants the three controls that get them moving, not
 * a reference to the recentre key. The reference lives at `/controls`, which
 * is a page people search for on its own.
 */
export function ControlTable({
  rows,
  caption,
}: {
  rows: readonly ControlRow[];
  caption: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="hud-label">{caption}</h3>
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.action}
              className="border-b border-[var(--border-color)]/50 align-top"
            >
              <th scope="row" className="text-ink w-32 py-2 font-medium">
                {row.action}
              </th>
              <td className="py-2">
                <span className="flex flex-wrap gap-1">
                  {row.keys.map((k) => (
                    <kbd
                      key={k}
                      className="bg-surface text-ink rounded-[var(--radius)] px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-white/10"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
                {row.note && (
                  <span className="text-dim mt-1 block text-xs leading-relaxed">
                    {row.note}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Controls({
  kind,
  slug,
}: {
  kind: "foot" | "arcade";
  slug: string;
}) {
  if (kind === "arcade") {
    // The cabinet's own hints, from the registry the overlay reads, so a
    // control that changes in the game changes here. A cabinet has one or two
    // controls, so this IS the whole table rather than an excerpt of one.
    const entry = ARCADE.find((c) => c.id === slug);
    if (!entry) return null;
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-lg font-bold">Controls</h2>
        <p className="text-dim text-sm leading-relaxed">
          <span className="text-ink font-medium">Keyboard:</span>{" "}
          {entry.hint.keys}
        </p>
        <p className="text-dim text-sm leading-relaxed">
          <span className="text-ink font-medium">Touch:</span>{" "}
          {entry.hint.touch}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-bold">Controls</h2>
      <ControlTable caption="What you need to start" rows={FOOT_ESSENTIALS} />
      <p className="text-dim text-xs leading-relaxed">
        Sprint is a latch rather than a hold — tap it once and it stays on.{" "}
        <Link href="/controls" className="text-accent underline">
          Every control, keyboard and touch
        </Link>
        , including respawn, restart and the camera keys, and all of them
        rebindable.
      </p>
    </section>
  );
}
