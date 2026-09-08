import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull, sql } from "drizzle-orm";
import { worlds } from "../src/lib/db/schema";
import { courseFloorFor } from "../src/lib/course-floor";
import { parseWorldDoc } from "../src/lib/worlddoc";

/**
 * Fill in `floor_ms` / `floor_key` for worlds that predate them.
 *
 * `npm run floors:backfill`. Migration 0002 adds the two columns null, and
 * every write path fills them from then on — so without this a course that
 * already existed has no medals and no submission guard until somebody happens
 * to open it and press Save. That is a silent gap, and the whole point of
 * putting the floor on the row was to stop the medals depending on which kind
 * of world you were on.
 *
 * Safe to run repeatedly: it only touches rows whose key is missing, so a
 * second run does nothing and a third costs one query. Pass `--all` to
 * recompute every row, which is what a change to `courseKey`'s version prefix
 * or to the solver itself calls for.
 */

const all = process.argv.includes("--all");
const dry = process.argv.includes("--dry-run");

async function main() {
  // Imported here and not at the top: `lib/db` reads DATABASE_URL at module
  // scope, and every static import in a file is resolved before its first
  // statement runs — so a top-level `import { db }` would be evaluated before
  // the `config()` call above had put the variable there.
  const { db } = await import("../src/lib/db");

  const rows = await db
    .select({ id: worlds.id, name: worlds.name, doc: worlds.doc, floorMs: worlds.floorMs })
    .from(worlds)
    .where(all ? sql`true` : isNull(worlds.floorKey));

  console.log(`${rows.length} world(s) to consider${all ? " (--all)" : ""}.`);

  let courses = 0;
  let changed = 0;

  for (const row of rows) {
    let doc;
    try {
      doc = parseWorldDoc(row.doc);
    } catch {
      // A row that no longer validates cannot be solved, and a backfill is the
      // wrong place to find out. Say so and move on rather than stopping.
      console.warn(`  ! ${row.id} (${row.name}): document does not validate — skipped`);
      continue;
    }

    const started = Date.now();
    // No previous pair passed: the point of this script is that there is none
    // worth trusting. Every course here pays for one solve, once.
    const { floorKey, floorMs } = courseFloorFor(doc);
    const took = Date.now() - started;

    if (floorMs === null) continue;
    courses++;
    if (row.floorMs === floorMs && !all) continue;

    console.log(
      `  ${row.id} (${row.name}): ${doc.parts.length} parts, floor ${floorMs}ms` +
        `${row.floorMs === null ? "" : ` (was ${row.floorMs}ms)`} — solved in ${took}ms`
    );
    if (!dry) {
      await db.update(worlds).set({ floorKey, floorMs }).where(eq(worlds.id, row.id));
    }
    changed++;
  }

  console.log(
    `${courses} course(s) of ${rows.length} world(s); ${changed} ${dry ? "would be written" : "written"}.`
  );
  // Deliberately NOT wiping any board here. A backfill is discovering a floor
  // that was always true of this geometry, not moving one — the board rule in
  // `PUT /api/worlds/:id` is about an author changing a course under it.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
