import { createClerkClient, verifyToken, type ClerkClient } from "@clerk/backend";
import { ServerError } from "colyseus";

/**
 * Who is on the other end of a socket.
 *
 * Two kinds of answer, and the difference matters everywhere downstream:
 *
 * - A **verified** user proved it with a Clerk session token. Only a verified
 *   user can ever own a world, so only a verified user can ever edit one.
 * - A **guest** did not sign in. They still join, still show up as an avatar,
 *   still race — but they cannot change anything anybody owns.
 *
 * The second kind is deliberate rather than a gap. Racing and watching are the
 * parts of this that should never ask for an account, and refusing everyone
 * without a token would have made "share a link to a world" mean "share a link
 * to a sign-up form".
 */
export interface RoomIdentity {
  userId: string;
  name: string;
  guest: boolean;
}

/**
 * The id a guest carries. Not `""` — an empty string compares equal to the
 * empty owner a built-in world reports through the unauthenticated world
 * source, which would quietly make every signed-out visitor its owner. Clerk
 * ids are `user_…`, so this can never collide with a real one either.
 */
export const GUEST_USER_ID = "guest";

/**
 * Development escape hatch: treat everyone as a signed-in editor.
 *
 * The only way to build in a room on a laptop with no Clerk keys, and the
 * reason it is opt-in rather than a fallback — "auth is not configured yet"
 * must fail closed, or the first deploy that forgets a key is wide open.
 */
export const anonymousRoomsAllowed = () => process.env.ALLOW_ANONYMOUS_ROOMS === "1";

/**
 * Origins whose tokens this server accepts, as Clerk's `azp` claim.
 *
 * Unset means "any origin in this Clerk instance", which is fine for one app
 * and worth tightening the moment there are two.
 */
const authorizedParties = () =>
  process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

let clerk: ClerkClient | null = null;
function clerkClient(secretKey: string): ClerkClient {
  clerk ??= createClerkClient({ secretKey });
  return clerk;
}

/** Display names, cached: a name tag is not worth an API call per join. */
const names = new Map<string, { name: string; at: number }>();
const NAME_TTL_MS = 10 * 60 * 1000;

/**
 * What to write on someone's name tag.
 *
 * A Clerk session token carries no name by default, so this prefers whatever
 * claims the instance happens to publish and falls back to one lookup per user
 * per ten minutes. A failed lookup is never fatal: an unnamed builder is a
 * cosmetic problem, and refusing the join over it would not be.
 */
async function displayName(
  userId: string,
  claims: Record<string, unknown>,
  secretKey: string
): Promise<string> {
  for (const key of ["name", "fullName", "firstName", "username"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const cached = names.get(userId);
  if (cached && Date.now() - cached.at < NAME_TTL_MS) return cached.name;

  try {
    const user = await clerkClient(secretKey).users.getUser(userId);
    const name = user.firstName?.trim() || user.username?.trim() || "Builder";
    names.set(userId, { name, at: Date.now() });
    return name;
  } catch {
    return "Builder";
  }
}

/**
 * Verify a joining client's token.
 *
 * Throws — with a status the client sees — rather than returning a failure, so
 * every room refuses the same way for free. What a verified user may then *do*
 * is not decided here: that depends on the world, and lives in BuildRoom.
 */
export async function verifyJoin(token: string): Promise<RoomIdentity> {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (token) {
    if (!secretKey) {
      // A token arrived and there is nothing to check it with. Honouring it
      // would be pretending; ignoring it silently would hand a signed-in owner
      // a guest seat in their own world.
      if (anonymousRoomsAllowed()) {
        return { userId: "anonymous", name: "Builder", guest: false };
      }
      throw new ServerError(501, "Room authentication is not configured");
    }

    let claims: Record<string, unknown>;
    try {
      claims = (await verifyToken(token, {
        secretKey,
        authorizedParties: authorizedParties(),
      })) as unknown as Record<string, unknown>;
    } catch {
      // Deliberately vague: expired, forged and wrong-instance all look the
      // same from here, and telling them apart is only useful to an attacker.
      throw new ServerError(401, "Sign-in could not be verified");
    }

    const userId = typeof claims.sub === "string" ? claims.sub : "";
    if (!userId) throw new ServerError(401, "Sign-in could not be verified");

    return { userId, name: await displayName(userId, claims, secretKey), guest: false };
  }

  if (anonymousRoomsAllowed()) {
    return { userId: "anonymous", name: "Builder", guest: false };
  }
  if (!secretKey) {
    throw new ServerError(501, "Room authentication is not configured");
  }
  return { userId: GUEST_USER_ID, name: "Guest", guest: true };
}
