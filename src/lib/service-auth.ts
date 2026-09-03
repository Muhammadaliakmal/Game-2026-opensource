import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The room server's credential.
 *
 * The room process holds no Neon credentials of its own — it reads and writes
 * worlds through this app (see `server/src/world-source.ts`). That makes it a
 * second kind of caller: not a person with a Clerk session, but a service we
 * deployed. It presents a shared secret, and the routes it uses are invisible
 * to everyone else.
 */

/** The header the room server presents its secret in. */
export const SERVICE_SECRET_HEADER = "x-blockworld-service";

/**
 * Constant-time comparison of two secrets.
 *
 * `timingSafeEqual` throws when the buffers differ in length — and the length
 * of a secret is itself worth not leaking — so both sides are hashed to a
 * fixed 32 bytes first. The comparison then tells an attacker nothing except
 * "wrong", however wrong it was.
 */
export function secretMatches(
  presented: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Whether a request came from the room server.
 *
 * An unset `MULTIPLAYER_SECRET` is a firm no, never a yes: a deployment that
 * forgot to configure one must end up with routes nobody can reach, not routes
 * anybody can.
 */
export function isRoomServer(req: Request): boolean {
  return secretMatches(
    req.headers.get(SERVICE_SECRET_HEADER),
    process.env.MULTIPLAYER_SECRET
  );
}
