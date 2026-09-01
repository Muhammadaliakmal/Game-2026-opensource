/**
 * One-shot player actions raised from the HUD and consumed by the frame loop.
 *
 * A plain module flag rather than store state: the producer (a button or key
 * handler) fires rarely, the consumer is `useFrame`, and nothing renders from
 * it — routing this through React would mean a re-render per press for no gain.
 */
const pending = { respawn: false };

/** Ask for a respawn on the next frame. */
export function requestRespawn() {
  pending.respawn = true;
}

/** Returns true at most once per request, clearing the flag. */
export function consumeRespawn(): boolean {
  if (!pending.respawn) return false;
  pending.respawn = false;
  return true;
}

/**
 * Respawn notifications, for chrome that wants to react to one (the screen
 * wash). Separate from the request flag above: that is a command going INTO
 * the frame loop, this is an event coming OUT of it.
 */
const respawnListeners = new Set<() => void>();

export function onRespawned(fn: () => void): () => void {
  respawnListeners.add(fn);
  return () => void respawnListeners.delete(fn);
}

/** Called by the player the moment it actually teleports. */
export function notifyRespawned() {
  for (const fn of respawnListeners) fn();
}
