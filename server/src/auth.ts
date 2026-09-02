import { ServerError } from "colyseus";

export interface RoomIdentity {
  userId: string;
  name: string;
}

/**
 * Who is allowed into a room.
 *
 * Until Clerk verification lands in 5d, a room accepts anyone — which is fine
 * on a laptop and unacceptable anywhere else. Refusing to start without an
 * explicit opt-in is the difference between "not built yet" and "quietly
 * shipped wide open".
 */
export async function verifyJoin(token: string): Promise<RoomIdentity> {
  if (process.env.ALLOW_ANONYMOUS_ROOMS === "1") {
    return { userId: "anonymous", name: "Builder" };
  }
  if (!token) throw new ServerError(401, "Sign-in required");
  throw new ServerError(501, "Room authentication is not configured");
}
