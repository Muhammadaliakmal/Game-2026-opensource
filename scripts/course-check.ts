import { BUILT_IN_WORLDS } from "../src/lib/built-in-worlds";
import { PARKOUR_COURSES } from "../src/lib/built-in-worlds";
import {
  reachable,
  surfaceKey as key,
  surfaces,
  surfaceUnder,
} from "../src/lib/course-graph";
import { inCheckpoint } from "../src/lib/checkpoints";
import { buildColliders } from "../src/lib/greedy-mesh";
import { routeFloorMs, authorFromFloor, AUTHOR_MS } from "../src/lib/medals";
import { GROUND_SIZE } from "../src/components/editor/Ground";
import type { WorldDoc } from "../src/lib/worlddoc";

/**
 * Walk every shipped course and report what the test suite would say, plus the
 * Author time each one implies.
 *
 * `npm run courses:check`. This is an authoring tool, not a test: the tests in
 * `courses.test.ts` and `medals.test.ts` are the ones that gate a commit. What
 * this adds is the *number* — a failing test says a course is unreachable, and
 * this says which jump, how big the landings are, and what to paste into
 * `AUTHOR_MS`.
 */

const HALF = GROUND_SIZE / 2;

/** Reachable surfaces with nothing orthogonally beside them. Expert wants these. */
function oneBlockLandings(doc: WorldDoc): number {
  const all = surfaces(doc.parts);
  const from = surfaceUnder(doc.spawn, all);
  if (!from) return -1;
  const stood = reachable(from, all);
  let alone = 0;
  for (const k of stood) {
    const s = all.byCell.get(k)!;
    const beside = ([dx, dz]: [number, number]) =>
      (all.byColumn.get(`${s.x + dx},${s.z + dz}`) ?? []).some(
        (n) => n.y === s.y || n.y === s.y - 1
      );
    const joined = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as Array<[number, number]>
    ).some(beside);
    if (!joined) alone++;
  }
  return alone;
}

let bad = 0;
const authors: Array<[string, number]> = [];

for (const w of PARKOUR_COURSES) {
  const doc = w.build("user-1");
  const problems: string[] = [];
  const all = surfaces(doc.parts);

  const start = surfaceUnder(doc.spawn, all);
  if (!start) problems.push("nothing under the spawn");
  const finish = doc.goal ? surfaceUnder(doc.goal, all) : null;
  if (!finish) problems.push("nothing under the goal");

  if (start && finish) {
    const from = reachable(start, all);
    if (!from.has(key(finish))) problems.push("goal unreachable from spawn");

    const cps = doc.checkpoints ?? [];
    if (cps.length < 3) problems.push(`only ${cps.length} checkpoints`);
    for (const [i, cp] of cps.entries()) {
      const under = surfaceUnder(cp.pos, all);
      if (!under) {
        problems.push(`checkpoint ${i} floating at ${cp.pos}`);
        continue;
      }
      if (Math.abs(under.y - cp.pos[1]) > 0.001) {
        problems.push(
          `checkpoint ${i} sits ${(cp.pos[1] - under.y).toFixed(2)} above its deck`
        );
      }
      if (!from.has(key(under))) problems.push(`checkpoint ${i} unreachable`);
      else if (!reachable(under, all).has(key(finish))) {
        problems.push(`checkpoint ${i} is a dead end (soft lock)`);
      }
    }
    for (let i = 0; i < cps.length; i++) {
      for (let j = i + 1; j < cps.length; j++) {
        const [x, y, z] = cps[j].pos;
        if (inCheckpoint(x, y, z, cps[i])) problems.push(`checkpoints ${i}/${j} overlap`);
      }
    }
  }

  const seen = new Set<string>();
  for (const p of doc.parts) {
    const k = `${p[0]},${p[1]},${p[2]}`;
    if (seen.has(k)) problems.push(`duplicate cell ${k}`);
    seen.add(k);
    if (p[1] < 0) problems.push(`part below y=0 at ${k}`);
    if (p[0] < -HALF || p[0] >= HALF || p[2] < -HALF || p[2] >= HALF) {
      problems.push(`part outside the build plane at ${k}`);
    }
  }

  const { boxes, others } = buildColliders(doc.parts);
  const colliders = boxes.length + others.length;
  const ratio = doc.parts.length / colliders;
  if (ratio < 3.5) problems.push(`merges badly: ${ratio.toFixed(2)} parts/collider`);
  if (colliders >= 2500) problems.push(`${colliders} colliders`);
  if (doc.parts.length <= 100) problems.push(`only ${doc.parts.length} parts`);

  const alone = oneBlockLandings(doc);
  if ((w.tier === "Tutorial" || w.tier === "Easy") && alone !== 0) {
    problems.push(`${alone} one-block landings (tier allows 0)`);
  }
  if (w.tier === "Expert" && alone < 15) {
    problems.push(`only ${alone} one-block landings (Expert wants 15+)`);
  }

  const floor = routeFloorMs(doc);
  const author = floor === null ? null : authorFromFloor(floor);
  if (author !== null) authors.push([w.slug, author]);
  const stated = AUTHOR_MS[w.slug];
  if (author !== null && stated !== author) {
    problems.push(`AUTHOR_MS is ${stated ?? "missing"}, geometry says ${author}`);
  }

  const xs = doc.parts.map((p) => p[0]);
  const zs = doc.parts.map((p) => p[2]);
  const ys = doc.parts.map((p) => p[1]);
  const span =
    `x ${Math.min(...xs)}..${Math.max(...xs)}  ` +
    `z ${Math.min(...zs)}..${Math.max(...zs)}  ` +
    `y ${Math.min(...ys)}..${Math.max(...ys)}`;

  const head = `${problems.length ? "FAIL" : "ok  "}  ${w.tier!.padEnd(8)} ${w.slug.padEnd(11)}`;
  console.log(
    `${head} ${String(doc.parts.length).padStart(5)} parts  ` +
      `${String(colliders).padStart(4)} col  ratio ${ratio.toFixed(1).padStart(5)}  ` +
      `cp ${doc.checkpoints?.length ?? 0}  solo ${String(alone).padStart(3)}  ` +
      `author ${author === null ? "  n/a" : (author / 1000).toFixed(1) + "s"}  ${span}`
  );
  for (const p of problems) console.log(`        ! ${p}`);
  if (problems.length) bad++;
}

console.log(`\n${PARKOUR_COURSES.length} courses, ${bad} failing.`);
console.log(`${BUILT_IN_WORLDS.length} built-in worlds total.\n`);
console.log("AUTHOR_MS:");
for (const [slug, ms] of authors) {
  console.log(`  ${slug}: ${ms.toLocaleString("en-US").replace(/,/g, "_")},`);
}
