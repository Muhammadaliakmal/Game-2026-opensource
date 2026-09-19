import Link from "next/link";
import { communityCourses } from "@/lib/db/courses";
import { authorFromFloor, medalTimesFor, MEDAL_LABELS } from "@/lib/medals";
import { formatTime } from "@/lib/format-time";

/**
 * Courses other players published.
 *
 * ── One component, two pages ─────────────────────────────────────────────
 *
 * `/browse` and `/parkour` both want this list and want it to look the same,
 * and the ladder above it on `/parkour` is proof of what happens otherwise:
 * the parkour courses were a flat list on `/browse` for a phase, and nothing
 * about them said they were a ladder. A second, drifting copy of this markup
 * would put user courses in the same position.
 *
 * It reads `--color-accent` rather than a colour of its own, so the same cards
 * come out parkour green under `/parkour`'s `data-mode` and the site accent on
 * `/browse` — see globals.css.
 *
 * ── The whole tile is the link ───────────────────────────────────────────
 *
 * `CourseCard`'s argument, applied here: a picture with a small button under
 * it makes most of the target dead, which matters most on the phone this game
 * is mostly played on.
 */

/** What a card can promise before anybody has run the course. */
function target(floorMs: number): string | null {
  // The Author time is derived from the floor exactly the way a shipped
  // course's is (`authorFromFloor`), so a user course's Gold means the same
  // thing as Gold on the ladder — that is the whole point of 7b's split.
  const gold = medalTimesFor(authorFromFloor(floorMs)).find(
    (t) => t.medal === "gold"
  );
  return gold ? `${MEDAL_LABELS[gold.medal]} ${formatTime(gold.ms)}` : null;
}

export async function CommunityCourses({ limit = 24 }: { limit?: number }) {
  const courses = await communityCourses(limit);

  if (courses.length === 0) {
    return (
      <div className="text-dim rounded-[var(--radius)] border border-dashed border-[var(--border-color)] p-12 text-center text-sm">
        No player-made courses yet. Place a finish flag in the builder, publish
        the world, and it lands here.
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => {
        const chasing = target(c.floorMs);
        return (
          <li key={c.id}>
            <Link
              href={`/play/${c.id}`}
              className="group card hover:border-accent/70 focus-visible:border-accent/70 block overflow-hidden transition-colors"
            >
              <div className="relative h-28 w-full bg-[#0b1030]">
                {c.thumbnailUrl ? (
                  // A data URI or an R2 URL — next/image has nothing to
                  // optimize here, the same as on /browse.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.thumbnailUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  // No invented cover art. `CourseCard` can draw a skyline
                  // because it knows the tier; a user course has no tier and
                  // guessing one would be a picture that lies about the map.
                  // The floor is the one honest thing available before anybody
                  // has played it, so that is what the empty panel says.
                  <span className="hud-label num text-dim absolute inset-0 flex items-center justify-center">
                    route {formatTime(c.floorMs)}
                  </span>
                )}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(2,3,10,0.85) 0%, rgba(2,3,10,0.2) 60%, rgba(2,3,10,0) 100%)",
                  }}
                />
                <span className="hud-label text-accent absolute bottom-2 left-3">
                  Community
                </span>
              </div>

              <div className="flex flex-col gap-1 p-4">
                <h3 className="text-ink truncate text-base font-semibold">
                  {c.name}
                </h3>
                <p className="hud-label num text-dim">
                  {c.partCount.toLocaleString()} parts ·{" "}
                  {c.playCount.toLocaleString()} plays
                </p>
                {chasing && (
                  <p className="hud-label num text-dim mt-2">Chasing {chasing}</p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What stands in while the query runs.
 *
 * Three cards rather than a spinner: the section has a known shape and a
 * spinner would collapse it, moving everything under it when the list lands.
 */
export function CommunityCoursesFallback() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="card h-52 animate-pulse opacity-40" />
      ))}
    </ul>
  );
}
