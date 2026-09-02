/**
 * SPEC §11.2/§11.3 (Blender + gltf-transform passes, merged — see
 * scripts/lib/gltf-pipeline.ts for why Blender itself isn't in this step).
 *
 *   node --import tsx scripts/optimize-props.ts
 *
 * Reads assets/raw-props/manifest.json (written by scripts/meshy-batch.ts),
 * decimates + re-origins + compresses each GLB, writes the results to
 * public/props/ (the dev-copy path from SPEC §3's file tree), and
 * regenerates src/lib/props-catalog.ts pointing at those local paths.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { optimizeProp, TARGET_TRIANGLES } from "./lib/gltf-pipeline";
import { writeCatalog, type CatalogEntry } from "./lib/write-catalog";

const RAW_DIR = join(process.cwd(), "assets", "raw-props");
const OUT_DIR = join(process.cwd(), "public", "props");
const THUMB_DIR = join(OUT_DIR, "thumbs");
/** SPEC §11.3: "each catalog GLB under ~200 KB." */
const SIZE_WARNING_BYTES = 200 * 1024;

interface RawManifestEntry {
  id: string;
  name: string;
  rawGlb: string;
  rawThumb: string;
}

async function main() {
  const manifestPath = join(RAW_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      `No ${manifestPath}. Run scripts/meshy-batch.ts first to generate the raw props.`
    );
    process.exitCode = 1;
    return;
  }
  const manifest: RawManifestEntry[] = JSON.parse(readFileSync(manifestPath, "utf8"));

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(THUMB_DIR, { recursive: true });

  const catalog: CatalogEntry[] = [];
  for (const entry of manifest) {
    process.stdout.write(`  ${entry.id}: optimizing… `);
    try {
      const outGlb = join(OUT_DIR, `${entry.id}.glb`);
      const result = await optimizeProp(entry.rawGlb, outGlb);

      if (existsSync(entry.rawThumb)) {
        await sharp(entry.rawThumb)
          .resize(256, 256, { fit: "cover" })
          .jpeg({ quality: 80 })
          .toFile(join(THUMB_DIR, `${entry.id}.jpg`));
      }

      const kb = (result.bytes / 1024).toFixed(0);
      const flag = result.bytes > SIZE_WARNING_BYTES ? "  ⚠ over 200 KB budget" : "";
      console.log(`${result.triangleCount} tris, ${kb} KB${flag}`);

      catalog.push({ id: entry.id, name: entry.name, size: result.size });
    } catch (err) {
      console.log(`ERROR (${(err as Error).message})`);
    }
  }

  writeCatalog(catalog, "/props");

  console.log(
    `\n${catalog.length}/${manifest.length} props optimized (target ≤${TARGET_TRIANGLES} tris).\n` +
      `Written to ${OUT_DIR} and src/lib/props-catalog.ts.`
  );
}

main();
