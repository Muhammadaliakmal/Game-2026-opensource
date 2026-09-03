/**
 * Draws the sky gradient to a PNG so it can be judged without a browser.
 *
 * MAP.md §11 Stage 3's exit criterion is visual — "a screenshot at golden hour
 * looks good with zero props placed" — and the honest problem is that taking a
 * real screenshot needs a browser attached to a running room server. This is
 * the next best thing and it is not a bad one: the ramp is the whole of what
 * that criterion judges, and evaluating it on the CPU with the same maths the
 * shader uses shows exactly the colours the dome will paint.
 *
 * It renders the sun side and the anti-sun side next to each other, because the
 * horizontal warm bias is easy to get wrong in a way a single column hides.
 *
 * Run: npm run sky:preview
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as THREE from "three";
import {
  SKY_STOPS,
  SUN_BIAS_FALLOFF,
  SUN_BIAS_HEIGHT_FALLOFF,
  SUN_BIAS_STRENGTH,
  SUN_ELEVATION_DEG,
  sampleRamp,
} from "../src/lib/atmosphere";

const W = 900;
const H = 520;

/**
 * The same warm bias the shader applies: brighter toward the sun's azimuth,
 * falling off with a power curve, and strongest near the horizon where the
 * light has travelled through the most atmosphere.
 */
function sunBias(horizontal: number, height: number): number {
  // `horizontal` is -1 (anti-sun) .. 1 (sun). Map to a 0..1 proximity.
  const facing = Math.max(0, (horizontal + 1) / 2);
  const lobe = Math.pow(facing, SUN_BIAS_FALLOFF);
  const lowSky = Math.pow(1 - height, SUN_BIAS_HEIGHT_FALLOFF);
  return lobe * lowSky * SUN_BIAS_STRENGTH;
}

async function main() {
  const px = Buffer.alloc(W * H * 3);
  const c = new THREE.Color();
  const warm = new THREE.Color("#FFD8A8");

  for (let y = 0; y < H; y++) {
    // Top row is the zenith. The dome only shows the sky above the horizon, so
    // the visible band is 0..1 of the ramp with a little below-horizon margin.
    const height = 1 - y / (H - 1);

    for (let x = 0; x < W; x++) {
      const horizontal = (x / (W - 1)) * 2 - 1;

      sampleRamp(height, c);
      const bias = sunBias(horizontal, height);
      c.lerp(warm, bias);

      // The scene renders linear and three converts on output; this file has
      // to do that conversion itself or the PNG is a much darker image than
      // the one the game will show.
      const s = c.clone().convertLinearToSRGB();
      const i = (y * W + x) * 3;
      px[i] = Math.round(THREE.MathUtils.clamp(s.r, 0, 1) * 255);
      px[i + 1] = Math.round(THREE.MathUtils.clamp(s.g, 0, 1) * 255);
      px[i + 2] = Math.round(THREE.MathUtils.clamp(s.b, 0, 1) * 255);
    }
  }

  // A horizon rule, so the elevation of the sun can be read off the image.
  const horizonY = H - 1;
  // docs/, not public/. This is reference material for whoever tunes the ramp;
  // in public/ it would be served as part of the deployed site.
  const out = path.join(process.cwd(), "docs", "sky-preview.png");
  await writeFile(
    out,
    await sharp(px, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer()
  );

  console.log(`sky-preview.png  ${W}x${H}`);
  console.log(`sun elevation ${SUN_ELEVATION_DEG}deg, horizon at row ${horizonY}`);
  console.log("stops, bottom to top:");
  for (const s of SKY_STOPS) console.log(`  ${s.at.toFixed(2)}  ${s.hex}  ${s.note}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
