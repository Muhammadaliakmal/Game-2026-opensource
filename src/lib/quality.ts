"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useCoarsePointer } from "./use-media-query";
import type { TextureMode } from "./textures/block-shader";

/**
 * Render quality tiers.
 *
 * ── What this is actually for ────────────────────────────────────────────
 *
 * Measured, not guessed. Neon Circuit is 8,446 blocks, and the chamfered cube
 * they are all drawn with is 300 triangles — so the camera pass alone is 2.53
 * million triangles, and because every bucket was `castShadow`, the shadow
 * pass drew all of it again:
 *
 *   camera pass   2,533,800
 *   shadow pass   2,533,800
 *   TOTAL         5,067,600 triangles per frame
 *
 * MAP.md §10 puts the mobile ceiling at 350k. The track was running at
 * fourteen times that, which is the lag — not the sky, not the post chain, not
 * anything subtle. Three levers below address it, in the order they pay:
 *
 * 1. `groundCastsShadow`. 6,340 of those 8,446 blocks are the flat racing
 *    surface at y=0. Their top faces are coplanar, so the shadow they cast
 *    falls exactly where they already are and is invisible — while costing
 *    75% of the shadow pass. This is the rare optimisation with no visual
 *    cost at all, so it is off at every tier.
 *
 * 2. `blockDetail`. The same chamfered cube at one corner segment instead of
 *    two is 108 triangles rather than 300 and still reads as chamfered. At a
 *    metre per block on a phone screen the difference is not visible; a 64%
 *    cut in the camera pass is.
 *
 * 3. `dpr` and `antialias`. A voxel world is fragment-bound. Dropping DPR from
 *    1.5 to 1.0 is 2.25x less fragment work, and R3F leaves `antialias` on by
 *    default — MSAA on a phone, paid on every one of those fragments.
 *
 * ── The fourth lever, which is not a tier ────────────────────────────────
 *
 * A block sealed inside a solid mass is drawn like any other and paints no
 * pixels. That is not a quality trade-off — there is no version of the picture
 * where it is visible — so it is not a field here: `lib/occlusion.ts` culls it
 * unconditionally, at every tier, the way `groundCastsShadow` is off at every
 * tier. It is listed with these because it is the same kind of win and it is
 * the largest one on a solid world: Island is 5,763 parts and 2,594 of them
 * are interior, so its camera pass falls from 1.73M triangles to 0.95M.
 *
 * It pays nothing on a flat world — Neon Circuit has no interior at all — and
 * that is the point of keeping it separate from the tiers. A tier is a guess
 * about the machine; this is a fact about the world.
 *
 * ── Why tiers rather than one mobile branch ──────────────────────────────
 *
 * The old version keyed everything off `(pointer: coarse)`, which is a good
 * proxy for "is this a phone" and no proxy at all for "is this phone fast". A
 * recent flagship and a four-year-old budget Android are both coarse-pointer
 * and are not the same machine. MAP.md §7.1 asks for three tiers with a player
 * override, and that is what this is.
 */

export type Tier = "low" | "medium" | "high";

export interface RenderQuality {
  tier: Tier;
  /** [min, max] device pixel ratio handed to the Canvas. */
  dpr: [number, number];
  /** Directional light shadow map edge, px. 0 disables shadows entirely. */
  shadowMap: number;
  /** MSAA. Expensive on mobile and largely wasted on hard-edged voxels. */
  antialias: boolean;
  /**
   * Whether the world's lowest layer casts shadows. See the header — this is
   * false everywhere because it buys 75% of the shadow pass for nothing.
   */
  groundCastsShadow: boolean;
  /** Corner segments on the chamfered block: 2 is the original, 1 is cheaper. */
  blockDetail: 1 | 2;
  /**
   * What a block material samples from the surface arrays. `surface` is one
   * array read (tint + roughness); `full` adds the normal array and the
   * close-up detail pass, which together triple the texture fetches per
   * fragment. See lib/textures/block-shader.ts.
   */
  textures: TextureMode;
  /**
   * Anisotropic filtering on the block arrays. Clamped to what the GPU
   * offers. The spec's "cheapest visual upgrade in 3D", and on a voxel floor
   * seen at a glancing angle it is: 1 smears past a few metres, 8 is sharp to
   * the horizon.
   */
  anisotropy: number;
  /**
   * The post-processing chain — bloom on the emissive finish and a vignette.
   * Off on low: it is a second full-screen pass on a fragment-bound device.
   */
  post: boolean;
}

const TIERS: Record<Tier, Omit<RenderQuality, "tier">> = {
  low: {
    dpr: [1, 1],
    // Not 0. Shadows are most of what grounds a bike on a flat track, and
    // losing them entirely is a bigger visual loss than anything else here
    // buys back. 512 is coarse but it is a shadow.
    shadowMap: 512,
    antialias: false,
    groundCastsShadow: false,
    blockDetail: 1,
    textures: "surface",
    anisotropy: 1,
    post: false,
  },
  medium: {
    dpr: [1, 1.5],
    shadowMap: 1024,
    antialias: false,
    groundCastsShadow: false,
    blockDetail: 1,
    textures: "full",
    anisotropy: 4,
    post: true,
  },
  high: {
    dpr: [1, 2],
    shadowMap: 2048,
    antialias: true,
    groundCastsShadow: false,
    blockDetail: 2,
    textures: "full",
    anisotropy: 8,
    post: true,
  },
};

const ORDER: Tier[] = ["low", "medium", "high"];

/**
 * A ceiling the frame monitor has lowered this session, or null.
 *
 * ── Why it is a ceiling on the detected tier and not an override ─────────
 *
 * The player's explicit choice always wins. Somebody who opened the settings
 * and picked High knows what they asked for, and a game that quietly undoes
 * that after a stutter is a game whose settings lie. The drop only applies
 * to a tier the code GUESSED — `detectTier` is deliberately crude and this is
 * the correction for when the guess was optimistic.
 *
 * Session-only, on purpose. A tab that was throttled while another app
 * updated in the background should not start Low forever.
 */
let autoCeiling: Tier | null = null;

const lowerOf = (a: Tier, b: Tier): Tier =>
  ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;

const OVERRIDE_KEY = "render_tier_v1";

/**
 * What the device looks like it can take.
 *
 * Deliberately crude. Every reliable signal here is either unavailable or a
 * lie — `deviceMemory` is Chrome-only and rounded, the WebGL renderer string
 * is masked in more browsers every year, and a benchmark on first load costs
 * the frames it is trying to protect. Core count plus pointer type gets the
 * three buckets roughly right, and the override exists for when it does not.
 */
function detectTier(coarse: boolean): Tier {
  if (typeof navigator === "undefined") return "medium";

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;

  if (coarse) {
    // A phone with 8+ cores and 6GB is a recent flagship and can take medium;
    // everything else on a touch screen starts low. MAP.md is explicit that
    // mobile gets Low and that 30fps stable is a legitimate target there.
    return cores >= 8 && (memory ?? 0) >= 6 ? "medium" : "low";
  }

  if (cores <= 4 || (memory !== undefined && memory <= 4)) return "medium";
  return "high";
}

function readOverride(): Tier | null {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    return v === "low" || v === "medium" || v === "high" ? v : null;
  } catch {
    // Private windows and blocked site data both throw rather than return null.
    return null;
  }
}

const overrideListeners = new Set<() => void>();

function subscribeOverride(cb: () => void) {
  overrideListeners.add(cb);
  // Another tab changing the setting should be picked up here too.
  window.addEventListener("storage", cb);
  return () => {
    overrideListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Feed one frame's duration. Part 12 of the texture spec: sixty slow frames
 * in a row (net of fast ones) drop the detected tier by one step, then the
 * count resets so a second drop takes another sixty. Call it from a
 * `useFrame`, with `dt` in seconds.
 *
 * 20 ms is a 50 fps frame — a miss at 60 that is still well above the 30 the
 * low tier targets, so a phone that genuinely cannot hold 60 drops early
 * rather than after the player has already noticed.
 */
let slowFrames = 0;
export function monitorFrame(dtSeconds: number, current: Tier) {
  if (dtSeconds > 0.02) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames <= 60) return;
  slowFrames = 0;
  const i = ORDER.indexOf(current);
  if (i === 0) return;
  autoCeiling = ORDER[i - 1];
  for (const fn of overrideListeners) fn();
}

/** Set or clear the player's explicit choice. Pass null to go back to auto. */
export function setTierOverride(tier: Tier | null) {
  try {
    if (tier === null) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, tier);
  } catch {
    // Nothing to do — the session keeps whatever it already resolved.
  }
  for (const fn of overrideListeners) fn();
}

/**
 * The player's own graphics choices, each laid over the tier's default.
 *
 * ── Why these are separate from the tier ─────────────────────────────────
 *
 * A tier is one guess about the whole machine. A player usually has one
 * specific complaint — "it stutters, but I like the shadows" or "the glow
 * makes me feel sick" — and the answer to that is one switch, not a coarser
 * preset that also throws away everything else. Every field is optional:
 * absent means "whatever the tier says", so a player who has never opened
 * the menu gets exactly the tier.
 *
 * Stored under their own key. `render_tier_v1` stays what it was so nobody's
 * existing choice is lost over a new field.
 */
export interface GraphicsPrefs {
  /** What block materials sample. See TextureMode. */
  textures?: TextureMode;
  /** The post chain (bloom, vignette). */
  post?: boolean;
  /** Whether the sun casts at all. */
  shadows?: boolean;
  /**
   * Cap the device pixel ratio at 1. A voxel world is fragment-bound, so on
   * a 3× phone this is the single largest lever a player has — and the one
   * that costs the least to look at, because a chamfered block at arm's
   * length hides a soft pixel far better than text does.
   */
  performanceScale?: boolean;
}

const PREFS_KEY = "render_prefs_v1";
const PREF_KEYS = ["textures", "post", "shadows", "performanceScale"] as const;
const TEXTURE_MODES: readonly TextureMode[] = ["flat", "surface", "full"];

/** The stored object, or an empty one, with anything unrecognised dropped. */
function readPrefs(): GraphicsPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return EMPTY_PREFS;
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: GraphicsPrefs = {};
    if (TEXTURE_MODES.includes(v.textures as TextureMode)) out.textures = v.textures as TextureMode;
    if (typeof v.post === "boolean") out.post = v.post;
    if (typeof v.shadows === "boolean") out.shadows = v.shadows;
    if (typeof v.performanceScale === "boolean") out.performanceScale = v.performanceScale;
    return out;
  } catch {
    return EMPTY_PREFS;
  }
}

// One stable object for "nothing set", so useSyncExternalStore does not see
// a fresh {} on every read and re-render forever.
const EMPTY_PREFS: GraphicsPrefs = Object.freeze({});
let prefsCache: { raw: string | null; value: GraphicsPrefs } | null = null;

function prefsSnapshot(): GraphicsPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    return EMPTY_PREFS;
  }
  if (prefsCache && prefsCache.raw === raw) return prefsCache.value;
  prefsCache = { raw, value: readPrefs() };
  return prefsCache.value;
}

/** Set one preference, or pass undefined to hand it back to the tier. */
export function setGraphicsPref<K extends keyof GraphicsPrefs>(
  key: K,
  value: GraphicsPrefs[K] | undefined
) {
  const next: GraphicsPrefs = { ...prefsSnapshot() };
  if (value === undefined) delete next[key];
  else next[key] = value;
  try {
    if (PREF_KEYS.some((k) => next[k] !== undefined)) {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(PREFS_KEY);
    }
  } catch {
    // The session keeps what it has.
  }
  for (const fn of overrideListeners) fn();
}

/** Every preference back to the tier. */
export function clearGraphicsPrefs() {
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    // As above.
  }
  for (const fn of overrideListeners) fn();
}

/** The player's explicit tier choice, null for auto. For a settings UI. */
export function useTierOverride(): Tier | null {
  return useSyncExternalStore(subscribeOverride, readOverride, () => null);
}

/** The tier the device would get with no override — what "Auto" means. */
export function useDetectedTier(): Tier {
  const coarse = useCoarsePointer();
  const ceiling = useSyncExternalStore(subscribeOverride, () => autoCeiling, () => null);
  const detected = detectTier(coarse);
  return ceiling ? lowerOf(detected, ceiling) : detected;
}

/** The player's graphics preferences, for a settings UI. */
export function useGraphicsPrefs(): GraphicsPrefs {
  return useSyncExternalStore(subscribeOverride, prefsSnapshot, () => EMPTY_PREFS);
}

export function useRenderQuality(): RenderQuality {
  const coarse = useCoarsePointer();

  // An external store rather than an effect: localStorage lives outside React,
  // and `getServerSnapshot` is the supported way to say what the server should
  // have rendered. The repo's react-hooks/set-state-in-effect rule rejects the
  // alternative, and is right to.
  const override = useSyncExternalStore(
    subscribeOverride,
    readOverride,
    () => null
  );

  // The ceiling lives outside React too, and changes through the same
  // listener set, so one subscription covers both.
  const ceiling = useSyncExternalStore(
    subscribeOverride,
    () => autoCeiling,
    () => null
  );
  const prefs = useSyncExternalStore(subscribeOverride, prefsSnapshot, () => EMPTY_PREFS);

  return useMemo(() => {
    const detected = detectTier(coarse);
    const tier = override ?? (ceiling ? lowerOf(detected, ceiling) : detected);
    const base = TIERS[tier];
    return {
      tier,
      ...base,
      textures: prefs.textures ?? base.textures,
      post: prefs.post ?? base.post,
      shadowMap: prefs.shadows === false ? 0 : base.shadowMap,
      dpr: prefs.performanceScale ? [1, 1] : base.dpr,
    };
  }, [override, ceiling, coarse, prefs]);
}

/** The tiers, for a settings UI to enumerate. */
export const TIER_NAMES: Tier[] = ["low", "medium", "high"];

/** A tier's defaults before any preference — what "Auto" means in Settings. */
export function tierDefaults(tier: Tier): Omit<RenderQuality, "tier"> {
  return TIERS[tier];
}
