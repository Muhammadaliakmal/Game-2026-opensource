/**
 * Where the local player's position goes.
 *
 * There are two kinds of room now — a build room and a match — and the player
 * has no business knowing which one it is standing in. Each connection
 * registers its sender here on connect and clears it on disconnect; with no
 * connection this is one null check per frame and nothing else.
 */
type Sender = (x: number, y: number, z: number, yaw: number) => void;

let sender: Sender | null = null;

export function setPresenceSender(fn: Sender | null) {
  sender = fn;
}

/** ~12 Hz. Fast enough that 120 ms of interpolation always has a segment to walk. */
export const SEND_INTERVAL = 83;

/**
 * Throttles for whoever is connected. Kept here rather than in each connection
 * so a room swap cannot double the send rate.
 */
let lastSent = 0;

export function sendMove(x: number, y: number, z: number, yaw: number) {
  if (!sender) return;
  const now = Date.now();
  if (now - lastSent < SEND_INTERVAL) return;
  lastSent = now;
  sender(x, y, z, yaw);
}
