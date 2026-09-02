/**
 * SPEC §11.4 — pushes the optimized catalog to R2 and points
 * src/lib/props-catalog.ts at the public R2 URLs instead of the local
 * public/props/ dev copies.
 *
 *   node --import tsx scripts/upload-props.ts
 *
 * Run scripts/optimize-props.ts first. Requires R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and
 * NEXT_PUBLIC_R2_PUBLIC_URL in .env.local — see .env.example. The bucket's
 * CORS policy doesn't matter here (that's only for browser presigned PUTs);
 * this script uploads directly with the account's own credentials.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { putFile } from "../src/lib/r2";
import { PROP_CATALOG } from "../src/lib/props-catalog";
import { writeCatalog, type CatalogEntry } from "./lib/write-catalog";

config({ path: ".env.local" });

const OUT_DIR = join(process.cwd(), "public", "props");
const THUMB_DIR = join(OUT_DIR, "thumbs");

async function main() {
  if (PROP_CATALOG.length === 0) {
    console.error("props-catalog.ts is empty — run scripts/optimize-props.ts first.");
    process.exitCode = 1;
    return;
  }

  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!publicBase) {
    console.error("Missing NEXT_PUBLIC_R2_PUBLIC_URL — see .env.example.");
    process.exitCode = 1;
    return;
  }

  const catalog: CatalogEntry[] = [];
  for (const prop of PROP_CATALOG) {
    const glbPath = join(OUT_DIR, `${prop.id}.glb`);
    const thumbPath = join(THUMB_DIR, `${prop.id}.jpg`);
    if (!existsSync(glbPath)) {
      console.log(`  ${prop.id}: SKIPPED (no ${glbPath})`);
      continue;
    }

    process.stdout.write(`  ${prop.id}: uploading… `);
    await putFile(`props/${prop.id}.glb`, glbPath, "model/gltf-binary");
    if (existsSync(thumbPath)) {
      await putFile(`props/thumbs/${prop.id}.jpg`, thumbPath, "image/jpeg");
    }
    console.log("done");

    catalog.push({ id: prop.id, name: prop.name, size: prop.size });
  }

  writeCatalog(catalog, `${publicBase.replace(/\/$/, "")}/props`);

  console.log(`\nUploaded ${catalog.length}/${PROP_CATALOG.length} props to R2.`);
}

main();
