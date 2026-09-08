/**
 * Where the other people in a room are, kept OUTSIDE React on purpose.
 *
 * Peer transforms change ~12 times a second per person; routing them through
 * React state would re-render the tree on every packet for numbers only a
 * useFrame ever reads. Same reasoning as the editor's parts Map (see
 * stores/editor-store.ts) — the *set* of peers is React state, their motion
 * is not.
 */
import { DEFAULT_CHARACTER } from "@/lib/characters";

export interface PeerSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Client clock, milliseconds. */
  t: number;
}

export interface Peer {
  id: string;
  name: string;
  building: boolean;
  /**
   * The character this peer is wearing — a `lib/characters.ts` id.
   *
   * Fixed for the life of the connection: it is set on join and the room never
   * changes it, which is why it sits here beside the name rather than in the
   * per-frame sample.
   */
  character: string;
  /** The two most recent samples: everything on screen is between them. */
  from: PeerSample;
  to: PeerSample;
}

/**
 * How far behind the newest sample we render. Packets arrive ~83 ms apart and
 * never on time, so a renderer that draws the latest sample the instant it
 * lands has nothing to move toward and must guess. Deliberately staying one
 * packet in the past means we are always interpolating between two known
 * positions rather than extrapolating into an invented one — the cost is 120 ms
 * of lag on someone else's avatar, which is invisible, and the alternative is
 * the rubber-banding everyone recognises.
 */
export const INTERP_DELAY = 120;

/** Below this vertical speed a peer is treated as walking rather than airborne. */
const AIRBORNE_VY = 1.2;

const peers = new Map<string, Peer>();

export const peerMap = () => peers;

export function addPeer(
  id: string,
  name: string,
  sample: PeerSample,
  building = true,
  character = DEFAULT_CHARACTER
) {
  peers.set(id, { id, name, building, character, from: sample, to: sample });
}

export function removePeer(id: string) {
  peers.delete(id);
}

export function clearPeers() {
  peers.clear();
}

/**
 * Records where a peer now is. The previous `to` becomes `from`, so the
 * renderer always has a segment to walk along.
 */
export function pushSample(id: string, sample: PeerSample, building?: boolean) {
  const peer = peers.get(id);
  if (!peer) return;
  // A packet older than the one already applied would drag the avatar
  // backwards along its own path; the newest position is the only one worth
  // drawing. This also rules out a zero-length segment, which the
  // interpolation would have to divide by.
  if (sample.t <= peer.to.t) return;

  peer.from = peer.to;
  peer.to = sample;
  if (building !== undefined) peer.building = building;
}

export interface PeerMotion {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Horizontal speed in units/second — drives the avatar's gait. */
  moveSpeed: number;
  verticalSpeed: number;
  isOnGround: boolean;
}

/** Shortest-arc angle lerp: 350° → 10° must cross zero, not spin the long way. */
function lerpAngle(a: number, b: number, k: number) {
  const TWO_PI = Math.PI * 2;
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return a + d * k;
}

/** Where to draw a peer at wall-clock time `now`. */
export function samplePeer(peer: Peer, now: number): PeerMotion {
  const target = now - INTERP_DELAY;
  const span = peer.to.t - peer.from.t;
  // A single sample (a peer who just joined, or one standing perfectly still)
  // has no segment to walk: hold the position rather than divide by zero.
  const k = span > 0 ? Math.min(1, Math.max(0, (target - peer.from.t) / span)) : 1;

  const dt = span / 1000;
  const dx = peer.to.x - peer.from.x;
  const dy = peer.to.y - peer.from.y;
  const dz = peer.to.z - peer.from.z;
  const moveSpeed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
  const verticalSpeed = dt > 0 ? dy / dt : 0;

  return {
    x: peer.from.x + dx * k,
    y: peer.from.y + dy * k,
    z: peer.from.z + dz * k,
    yaw: lerpAngle(peer.from.yaw, peer.to.yaw, k),
    moveSpeed,
    verticalSpeed,
    // Nobody tells us whether a peer's feet are down — the room carries
    // position, not physics. Vertical speed is the honest proxy: it puts the
    // running animation on a runner and the tuck on a jumper, which is all the
    // avatar needs to read correctly.
    isOnGround: Math.abs(verticalSpeed) < AIRBORNE_VY,
  };
}
