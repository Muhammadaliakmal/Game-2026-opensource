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
