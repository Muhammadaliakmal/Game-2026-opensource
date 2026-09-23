/**
 * Which fight-sound pack Ragdoll Rumble plays.
 *
 * Its own tiny module, apart from the duel's `sound.ts`, because two sides
 * need it and only one of them may load the duel: the overlay's pause screen
 * (always loaded, where the choice is made) and the cabinet (a lazy chunk,
 * which reads it on every hit, so a change lands on the next punch without a
 * restart). No React and no store library — a value, storage, and a listener
 * set for `useSyncExternalStore`.
 */

export const FIGHT_PACKS = ["metal", "heavy", "cartoon", "retro"] as const;
export type FightPack = (typeof FIGHT_PACKS)[number];

export const FIGHT_PACK_LABEL: Record<FightPack, string> = {
  metal: "Arcade",
  heavy: "Heavy metal",
  cartoon: "Cartoon",
  retro: "Retro 8-bit",
};

const KEY = "sdg_fight_pack";
const listeners = new Set<() => void>();
let cached: FightPack | null = null;

function isPack(v: unknown): v is FightPack {
  return typeof v === "string" && (FIGHT_PACKS as readonly string[]).includes(v);
}

export function getFightPack(): FightPack {
  if (cached) return cached;
  let v: string | null = null;
  try {
    v = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  } catch {
    /* blocked storage: the default */
  }
  cached = isPack(v) ? v : "metal";
  return cached;
}

export function setFightPack(p: FightPack): void {
  cached = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* kept for this session */
  }
  for (const l of listeners) l();
}

export function subscribeFightPack(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
