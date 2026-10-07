import { create } from "zustand";

/**
 * "Watch an ad · back to where you fell" — the parkour half of the rewarded
 * continue (the arcade's is `RewardedContinue`).
 *
 * A fall or a lava death sends the runner back to the last checkpoint, which
 * on a long stretch can be a minute of climbing gone. The offer puts them back
 * where they were instead: not at the edge they fell from, which would drop
 * them again, but on ground they stood on a moment before (`SafeTrail`).
 *
 * Three pieces, all outside React because the Player reads them from a frame
 * loop: the trail of safe footing, the offer the HUD shows, and the teleport
 * the Player performs once the ad has been watched.
 */

export type Spot = { pos: [number, number, number]; yaw: number };

/** Ground stood on, sampled while grounded. The last sample is the edge. */
export class SafeTrail {
  private samples: Spot[] = [];
  private t = 0;

  /** Sample every 0.2 s of standing; keep the last two seconds. */
  record(dt: number, x: number, y: number, z: number, yaw: number) {
    this.t += dt;
    if (this.t < 0.2) return;
    this.t = 0;
    this.samples.push({ pos: [x, y + 0.3, z], yaw });
    if (this.samples.length > 10) this.samples.shift();
  }

  /** A spot a little before the last footing — back from the edge. */
  pick(): Spot | null {
    const n = this.samples.length;
    if (n === 0) return null;
    return this.samples[Math.max(0, n - 3)];
  }

  clear() {
    this.samples = [];
    this.t = 0;
  }
}

interface ReviveOffer {
  /** Where the offer would put the runner, or null for no offer. */
  spot: Spot | null;
  /** Bumped per death, so the HUD asks Google afresh for each one. */
  id: number;
  offer(spot: Spot): void;
  clear(): void;
}

export const useReviveOffer = create<ReviveOffer>((set) => ({
  spot: null,
  id: 0,
  offer: (spot) => set((s) => ({ spot, id: s.id + 1 })),
  clear: () => set({ spot: null }),
}));

let pendingTeleport: Spot | null = null;

export function requestTeleport(spot: Spot) {
  pendingTeleport = spot;
}

export function consumeTeleport(): Spot | null {
  const s = pendingTeleport;
  pendingTeleport = null;
  return s;
}
