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

const solidCache = new Map<string, THREE.MeshStandardMaterial>();

/** An ordinary lit surface: shell, limbs, trim. */
export function solid(
  color: string,
  roughness: number,
  metalness: number
): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = solidCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
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
