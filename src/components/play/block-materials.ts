import * as THREE from "three";

/**
 * One material per colour, for the life of the process.
 *
 * ── Why a module-level cache and not `useMemo` ───────────────────────────
 *
 * CLAUDE.md states the rule and the bug behind it: `useMemo` is per component
 * INSTANCE, so five bikes on a start grid meant five copies of an identical
 * material. Only genuinely per-instance values get a cache, and that cache is
 * a module-level Map.
 *
 * A character palette is exactly that case. Two characters wearing the same
 * trim colour should share the material for it, and a grid of four riders
 * should cost the materials the DESIGNS use rather than the materials times
 * the riders.
 *
 * ── Why it lives here and not in either component ────────────────────────
 *
 * The on-foot avatar and the rider on the bike are drawn by completely
 * different code — `CharacterModel` is a walk-cycle rig, `VoxelRider` is a
 * seated pose fitted to `SADDLE` — and they are the same character. They must
 * therefore resolve the same palette to the same material, or a player who
 * bought Frostbound gets one blue on foot and a slightly different blue on a
 * bike, from two caches that never met. Same reason `gait.ts` and `ride.ts`
 * exist as shared modules rather than as duplicated constants.
 *
 * ── Nothing here is ever disposed ────────────────────────────────────────
 *
 * Deliberate, and bounded: the key space is the palette, which is a constant
 * in `lib/character-design.ts`. The cache cannot grow with play time, only
 * with the size of the roster, so there is nothing to reclaim and disposing
 * would only mean rebuilding the same material the next time a character
 * spawns.
 */

/**
 * ── The weave ────────────────────────────────────────────────────────────
 *
 * Characters were flat. Every surface on them was a `MeshStandardMaterial`
 * with a colour and two numbers, so a suit, a boot and a helmet differed only
 * in how shiny they were — which at a distance is not a difference at all,
 * and up close reads as moulded plastic. Blocks got a whole surface system in
 * phase 9 and the people standing on them got nothing.
 *
 * This is the cheap half of that, and it is the half that matters here. One
 * 128² tile is painted ONCE into a canvas at module scope and shared by every
 * character material: a normal map with a woven twill in it, and a roughness
 * map that varies by the same weave so the light catches threads rather than
 * a sheet. Nothing is downloaded — a character can be on screen in the first
 * second of a race — and it is the same argument `arcade/host/texture.ts`
 * makes for painting its tiles once and using them as patterns.
 *
 * It is a TINT on the surface, not a picture: the palette colour a player
 * bought is still exactly the colour they get, for the reason CLAUDE.md gives
 * about blocks. The weave only decides where the light sits.
 *
 * `repeat` is per material rather than per mesh because the parts are small
 * and roughly a hand's width; one setting reads correctly across all of them,
 * and a per-mesh repeat would need UV work on geometry that is shared at
 * module scope.
 */
const WEAVE_PX = 128;

/** Painted on first use, then shared. Returns null where there is no canvas. */
let weaveMaps: {
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
} | null = null;
let weaveTried = false;

function weave() {
  if (weaveTried) return weaveMaps;
  weaveTried = true;
  // `render.test.ts` drives renderers with no `document`, and the server
  // renders nothing at all. A character without a weave is a character that
  // looks like it did last week, which is a fine thing to fall back to.
  if (typeof document === "undefined") return null;

  const n = document.createElement("canvas");
  n.width = n.height = WEAVE_PX;
  const nc = n.getContext("2d");
  const r = document.createElement("canvas");
  r.width = r.height = WEAVE_PX;
  const rc = r.getContext("2d");
  if (!nc || !rc) return null;

  const nd = nc.createImageData(WEAVE_PX, WEAVE_PX);
  const rd = rc.createImageData(WEAVE_PX, WEAVE_PX);

  // A twill: two offset sine ridges, one per axis, plus a little noise so the
  // threads are not machined. Seeded by position rather than Math.random, so
  // the tile is the same in every screenshot and tiles against itself.
  const noise = (x: number, y: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let y = 0; y < WEAVE_PX; y++) {
    for (let x = 0; x < WEAVE_PX; x++) {
      const u = (x / WEAVE_PX) * Math.PI * 2;
      const v = (y / WEAVE_PX) * Math.PI * 2;
      // 8 threads across the tile each way. Whole numbers, or the tile seams.
      const warp = Math.sin(u * 8);
      const weft = Math.sin(v * 8 + Math.PI / 2);
      const grain = (noise(x, y) - 0.5) * 0.35;

      // Slope of the weave along each axis becomes the normal's X and Y.
      const dx = warp * 0.5 + grain;
      const dy = weft * 0.5 + grain;
      const i = (y * WEAVE_PX + x) * 4;
      const clamp = (n: number) => (Math.max(0, Math.min(255, n)) | 0);
      nd.data[i] = clamp(128 + dx * 60);
      nd.data[i + 1] = clamp(128 + dy * 60);
      nd.data[i + 2] = 255;
      nd.data[i + 3] = 255;

      // Where a thread crests it is a touch smoother than where it dips.
      //
      // Centred near 255, NOT near mid-grey: three MULTIPLIES `roughness` by
      // this channel, so a 0.5 map would silently halve every roughness in
      // the file and read as "everything went shiny". Near white it modulates
      // what was authored instead of replacing it, which is the same identity
      // argument the block surface strips make at 0.5 with a shader that
      // doubles them.
      const rough = 238 + warp * weft * 14 + grain * 12;
      const q = Math.max(0, Math.min(255, rough)) | 0;
      rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = q;
      rd.data[i + 3] = 255;
    }
  }
  nc.putImageData(nd, 0, 0);
  rc.putImageData(rd, 0, 0);

  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    // Data, not colour: a normal or roughness map read as sRGB is wrong by
    // the whole transfer function, and the error looks like "too smooth".
    t.colorSpace = THREE.NoColorSpace;
    return t;
  };

  weaveMaps = { normalMap: tex(n), roughnessMap: tex(r) };
  return weaveMaps;
}

const solidCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * An ordinary lit surface: shell, limbs, trim.
 *
 * `textured` is opt-out rather than opt-in because most of a character is
 * cloth and armour. A visor or a lens passes false — a weave on glass is a
 * scratched visor, which is a different character from the one anybody
 * bought.
 */
export function solid(
  color: string,
  roughness: number,
  metalness: number,
  textured = true
): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${textured}`;
  let m = solidCache.get(key);
  if (!m) {
    const maps = textured ? weave() : null;
    m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...(maps && {
        normalMap: maps.normalMap,
        roughnessMap: maps.roughnessMap,
        // Restrained on purpose. The parts are 10cm boxes seen from three
        // metres at 20 units/s; a normal map strong enough to read in a
        // close-up is a rash at racing distance.
        normalScale: new THREE.Vector2(0.45, 0.45),
      }),
    });
    solidCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * A lit part: a chest core, an antenna bead.
 *
 * `toneMapped: false` is the whole difference from `solid`. ACES rolls bright
 * values off towards white gently, which is right for a surface catching light
 * and wrong for something that IS a light — a tone-mapped emissive reads as a
 * pale patch of paint rather than as a glow.
 *
 * A material whose emissive intensity is ANIMATED must not come from here.
 * The visor dims on a hard landing, per character, so a shared visor material
 * would blink every character on screen together; those stay inline.
 */
export function glow(
  color: string,
  intensity: number
): THREE.MeshStandardMaterial {
  const key = `${color}|${intensity}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      toneMapped: false,
    });
    glowCache.set(key, m);
  }
  return m;
}
