/**
 * SPEC §11.1 — offline, run ahead of time, not from the app.
 *
 *   node --import tsx scripts/meshy-batch.ts            # every prop in the catalog
 *   node --import tsx scripts/meshy-batch.ts crate barrel   # just these ids
 *
 * Talks to Meshy's Text-to-3D (Smart Topology) API, polls each task to
 * completion, and writes the raw GLB + thumbnail into assets/raw-props/ for
 * scripts/optimize-props.ts to pick up. Nothing here is committed or served —
 * assets/raw-props/ is gitignored, and public/props/ (the optimized output)
 * is what actually ships.
 *
 * Without MESHY_API_KEY set, this falls back to Meshy's published dummy test
 * key, which is free, unlimited, and always returns the same mock placeholder
 * model — enough to prove every step of the pipeline end to end (auth,
 * polling, download, decimate, re-origin, compress) before spending real
 * credits on real props.
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROP_SOURCES, type PropSource } from "./prop-catalog-source";

config({ path: ".env.local" });

const DUMMY_KEY = "msy_dummy_api_key_for_test_mode_12345678";
const API_KEY = process.env.MESHY_API_KEY || DUMMY_KEY;
const API_BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";
const RAW_DIR = join(process.cwd(), "assets", "raw-props");
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

if (API_KEY === DUMMY_KEY) {
  console.warn(
    "MESHY_API_KEY not set — using Meshy's dummy test key. Every prop will " +
      "download as the same mock placeholder model (0 credits, real API " +
      "shape). Set MESHY_API_KEY in .env.local and re-run to generate the " +
      "real catalog."
  );
}

interface MeshyTask {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  task_error: { message?: string } | null;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
  consumed_credits?: number;
}

async function createTask(prompt: string): Promise<string> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "preview",
      prompt,
      ai_model: "meshy-t2",
      model_type: "smart-topology",
      // Generous headroom over TARGET_TRIANGLES in gltf-pipeline.ts — the
      // optimize step still decimates further, but starting Meshy closer to
      // budget keeps the raw download (and the simplifier's work) smaller.
      target_polycount: 8000,
    }),
  });
  if (!res.ok) {
    throw new Error(`create task failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { result: string };
  return body.result;
}

async function pollTask(id: string): Promise<MeshyTask> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) {
      throw new Error(`poll failed: ${res.status} ${await res.text()}`);
    }
    const task = (await res.json()) as MeshyTask;
    if (task.status === "SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELED") {
      return task;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for task ${id} (last status ${task.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function download(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

interface RawManifestEntry extends PropSource {
  taskId: string;
  rawGlb: string;
  rawThumb: string;
  consumedCredits: number;
}

async function generateOne(source: PropSource): Promise<RawManifestEntry | null> {
  process.stdout.write(`  ${source.id}: creating task… `);
  const taskId = await createTask(source.prompt);
  process.stdout.write(`${taskId}, polling… `);
  const task = await pollTask(taskId);

  if (task.status !== "SUCCEEDED" || !task.model_urls?.glb) {
    console.log(`FAILED (${task.task_error?.message ?? task.status})`);
    return null;
  }

  const rawGlb = join(RAW_DIR, `${source.id}.glb`);
  const rawThumb = join(RAW_DIR, `${source.id}.png`);
  await download(task.model_urls.glb, rawGlb);
  if (task.thumbnail_url) await download(task.thumbnail_url, rawThumb);
  console.log(`done (${task.consumed_credits ?? 0} credits)`);

  return {
    ...source,
    taskId,
    rawGlb,
    rawThumb,
    consumedCredits: task.consumed_credits ?? 0,
  };
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });

  const only = new Set(process.argv.slice(2));
  const targets = only.size > 0 ? PROP_SOURCES.filter((p) => only.has(p.id)) : PROP_SOURCES;
  if (targets.length === 0) {
    console.error("No matching prop ids. Known ids:", PROP_SOURCES.map((p) => p.id).join(", "));
    process.exitCode = 1;
    return;
  }

  console.log(`Generating ${targets.length} prop(s) via Meshy…`);
  const entries: RawManifestEntry[] = [];
  let totalCredits = 0;
  for (const source of targets) {
    try {
      const entry = await generateOne(source);
      if (entry) {
        entries.push(entry);
        totalCredits += entry.consumedCredits;
      }
    } catch (err) {
      console.log(`ERROR (${(err as Error).message})`);
    }
  }

  // Merge into any existing manifest so a partial re-run (`... crate`) doesn't
  // drop every other prop that was already generated.
  const manifestPath = join(RAW_DIR, "manifest.json");
  let existing: RawManifestEntry[] = [];
  try {
    existing = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    /* first run */
  }
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of entries) byId.set(e.id, e);
  writeFileSync(manifestPath, JSON.stringify([...byId.values()], null, 2));

  console.log(
    `\n${entries.length}/${targets.length} succeeded, ${totalCredits} credits consumed.\n` +
      `Manifest: ${manifestPath}\nNext: node --import tsx scripts/optimize-props.ts`
  );
}

main();
