"use client";

import { useCoarsePointer } from "./use-media-query";

/**
 * Render quality, by device class.
 *
 * Two knobs decide most of what a phone spends its frame budget on, and both
 * were left at their desktop defaults:
 *
 * 1. Pixel ratio. R3F defaults to `[1, 2]`, so a DPR-3 phone renders every
 *    fragment four times over versus 1x — and a voxel world is fragment-bound,
 *    not vertex-bound. Capping at 1.5 is a little under half the fragment work
 *    of 2.0 for a difference most people cannot see on a screen held at arm's
 *    length.
 *
 * 2. Shadow map size. A 2048 map is four megatexels of depth, re-rendered from
 *    the sun's point of view every frame the light moves — which, with a
 *    follow-sun, is most of them. 1024 quarters that.
 *
 * Keyed off `(pointer: coarse)` rather than viewport width, for the same reason
 * the look controls are: a narrow desktop window is still a desktop GPU, and
 * softening it would be paying a visible cost for nothing.
 *
 * Neither is a quality *setting* — there is no menu for this. If a device
 * class turns out to want something different, it belongs here rather than in
 * four different Canvas call sites.
 */

/** [min, max] device pixel ratio handed to the Canvas. */
export const DESKTOP_DPR: [number, number] = [1, 2];
export const MOBILE_DPR: [number, number] = [1, 1.5];

export const DESKTOP_SHADOW_MAP = 2048;
export const MOBILE_SHADOW_MAP = 1024;

export interface RenderQuality {
  dpr: [number, number];
  shadowMap: number;
}

export function useRenderQuality(): RenderQuality {
  const coarse = useCoarsePointer();
  return coarse
    ? { dpr: MOBILE_DPR, shadowMap: MOBILE_SHADOW_MAP }
    : { dpr: DESKTOP_DPR, shadowMap: DESKTOP_SHADOW_MAP };
}
