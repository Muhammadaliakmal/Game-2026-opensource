/**
 * Character GLBs: compress, measure, and copy into public/characters/.
 *
 *   node --import tsx scripts/optimize-characters.ts
 *
 * Deliberately NOT scripts/optimize-props.ts. That pipeline exists to make a
 * prop cheap to place a hundred times: it flattens the node tree, joins every
 * mesh into one, and rewrites POSITION so the model is base-centred and
 * normalised to a unit box. Every one of those steps destroys a rigged
 * character — `join()` merges meshes that are bound to different parts of one
 * skin, and rewriting vertex positions under a skeleton detaches the mesh from
 * the bones that are supposed to move it.
 *
 * So this does only the passes that are safe on a skin: drop what nothing
 * references, deduplicate, shrink the texture, and compress the vertex data.
 * Scale is NOT normalised here — it is a number in `lib/characters.ts`,
 * because a character has to match the physics capsule rather than a unit box,
 * and that is a game-feel decision rather than an asset one.
 */
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { basename, join as joinPath } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import sharp from "sharp";

const RAW_DIR = joinPath(process.cwd(), "assets", "raw-characters");
const OUT_DIR = joinPath(process.cwd(), "public", "characters");

/**
 * A character is loaded once and worn for a whole session, where a prop is one
 * of a hundred in a world — so the budget is looser than the props' 200 KB,
 * but it is still a budget: in a full race everyone's model is downloaded.
 */
const SIZE_WARNING_BYTES = 300 * 1024;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "draco3d.decoder": await draco3d.createDecoderModule(),
    });

  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".glb"));
  for (const file of files) {
    const id = basename(file, ".glb");
    process.stdout.write(`  ${id}: `);

    const doc = await io.read(joinPath(RAW_DIR, file));
    await doc.transform(
      prune(),
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: "webp", resize: [256, 256] }),
      draco()
    );

    // Measured before writing, and printed rather than baked in: the height is
    // what `lib/characters.ts` divides into CAPSULE_HEIGHT to get `scale`, and
    // a character whose height changed needs that number looked at by a person.
    let lo = Infinity;
    let hi = -Infinity;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        if (!pos) continue;
        lo = Math.min(lo, pos.getMin([0, 0, 0])[1]);
        hi = Math.max(hi, pos.getMax([0, 0, 0])[1]);
      }
    }

    const skins = doc.getRoot().listSkins().length;
    const clips = doc.getRoot().listAnimations().length;

    const out = joinPath(OUT_DIR, `${id}.glb`);
    await io.write(out, doc);
    const bytes = statSync(out).size;
    const kb = (bytes / 1024).toFixed(0);
    const flag = bytes > SIZE_WARNING_BYTES ? "  ⚠ over 300 KB budget" : "";

    // A character with no skin would render as a frozen statue and a character
    // with a clip would fight the procedural gait for control of the same
    // bones. Both are worth saying out loud rather than discovering in game.
    const rig = skins === 1 ? "" : `  ⚠ ${skins} skins (expected 1)`;
    const anim = clips === 0 ? "" : `  ⚠ ${clips} animation(s) — see CharacterRig`;

    console.log(`${kb} KB, height ${(hi - lo).toFixed(3)}, feet at y=${lo.toFixed(3)}${flag}${rig}${anim}`);
  }

  console.log(`\n${files.length} character(s) written to ${OUT_DIR}.`);
}

main();
