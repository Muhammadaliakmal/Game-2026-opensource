/**
 * One-shot player actions raised from the HUD and consumed by the frame loop.
 *
 * A plain module flag rather than store state: the producer (a button or key
 * handler) fires rarely, the consumer is `useFrame`, and nothing renders from
 * it — routing this through React would mean a re-render per press for no gain.
 */
const pending = { respawn: false, restart: false };

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
 * Ask to start the course over — from the spawn, with the clock at zero.
 *
 * A different command from respawn, not a flag on it, because they are
 * opposites: a respawn is the mechanic that makes failure cheap by keeping
 * everything you banked, and a restart is the one that throws it away. On a
 * course with checkpoints there is otherwise no way to get a clean run, which
 * makes the per-map best time unbeatable once you have banked a checkpoint on
 * a bad attempt.
 */
export function requestRestart() {
  pending.restart = true;
}

/** Returns true at most once per request, clearing the flag. */
export function consumeRestart(): boolean {
  if (!pending.restart) return false;
  pending.restart = false;
  return true;
}

/**
 * Respawn notifications, for chrome that wants to react to one (the screen
 * wash). Separate from the request flag above: that is a command going INTO
 * the frame loop, this is an event coming OUT of it.
 */
/**
 * Why the run resumed. `fall` is the void, `hazard` is a block that kills,
 * `manual` is R, the button, or a restart. The wash colours itself by it and
 * the course counts the first two as deaths.
 */
export type RespawnCause = "fall" | "hazard" | "manual";

const respawnListeners = new Set<(cause: RespawnCause) => void>();

export function onRespawned(fn: (cause: RespawnCause) => void): () => void {
  respawnListeners.add(fn);
  return () => void respawnListeners.delete(fn);
}

/** Called by the player the moment it actually teleports. */
export function notifyRespawned(cause: RespawnCause) {
  for (const fn of respawnListeners) fn(cause);
}
