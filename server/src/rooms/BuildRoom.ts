import { Room, ServerError, type Client } from "colyseus";
import { z } from "zod";
import { Player, RoomPresence } from "../state.ts";
import { WorldSession } from "../world-session.ts";
import { getWorldSource } from "../world-source.ts";

/**
 * One room per world. The room owns the authoritative WorldDoc; clients own
 * only their own view of it.
 *
 * This class is deliberately thin — every rule about what an edit may do lives
 * in WorldSession, which knows nothing about sockets. What is left here is the
 * part that genuinely is networking: who may join, what gets sent on join, and
 * who hears about an accepted edit.
 */

/** Presence only: where a peer is standing. Never anything they typed. */
const moveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
  building: z.boolean().optional(),
});

export interface BuildRoomOptions {
  worldId?: string;
}

export class BuildRoom extends Room<{ state: RoomPresence }> {
  maxClients = 16;
  /**
   * 50 ms. Presence is a handful of floats, and anything faster buys motion
   * the eye cannot resolve at the cost of bandwidth everyone pays.
   */
  patchRate = 50;

  session!: WorldSession;

  /**
   * Until 5d wires Clerk, a room accepts anyone — which is fine on a laptop and
   * unacceptable anywhere else. Refusing to start without an explicit opt-in is
   * the difference between "not built yet" and "quietly shipped wide open".
   */
  static async onAuth(token: string) {
    if (process.env.ALLOW_ANONYMOUS_ROOMS === "1") return { userId: "anonymous", name: "Builder" };
    if (!token) throw new ServerError(401, "Sign-in required");
    throw new ServerError(501, "Room authentication is not configured");
  }

  async onCreate(options: BuildRoomOptions) {
    const worldId = options?.worldId;
    if (!worldId) throw new ServerError(400, "worldId is required");

    const doc = await getWorldSource().load(worldId);
    // 404, not an empty room: joining a world that does not exist and being
    // handed a blank one is how someone loses an afternoon of building.
    if (!doc) throw new ServerError(404, `world ${worldId} not found`);

    this.session = new WorldSession(doc);
    this.setState(new RoomPresence());
    this.roomId = worldId;

    this.onMessage("op", (client, message) => {
      const result = this.session.submit(client.sessionId, message);
      if (!result.ok) {
        // Told only to the sender: everyone else never saw the edit, so there
        // is nothing for them to reconcile.
        client.send("op-rejected", { reason: result.reason, detail: result.detail });
        return;
      }
      this.state.revision = result.revision;
      this.broadcast("op", result.op, { except: client });
    });

    // A client whose edit was refused is now ahead of the room. Rather than
    // leaving two people building in worlds that quietly disagree, it asks for
    // the authoritative one back.
    this.onMessage("resync", (client) => {
      client.send("world", { doc: this.session.doc, revision: this.session.revision });
    });

    this.onMessage("move", (client, message) => {
      const parsed = moveSchema.safeParse(message);
      if (!parsed.success) return;

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      player.x = parsed.data.x;
      player.y = parsed.data.y;
      player.z = parsed.data.z;
      player.yaw = parsed.data.yaw;
      if (parsed.data.building !== undefined) player.building = parsed.data.building;
    });
  }

  onJoin(client: Client) {
    // The whole world in one message, then ops from here on. Sending it before
    // the player is added means a joiner never sees an op for a world they do
    // not have yet.
    client.send("world", { doc: this.session.doc, revision: this.session.revision });

    const auth = client.auth as { name?: string } | undefined;
    const [x, y, z] = this.session.doc.spawn;
    this.state.players.set(
      client.sessionId,
      new Player({ name: auth?.name ?? "Builder", x, y, z, yaw: 0, building: true })
    );
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.session.forget(client.sessionId);
  }

  onDispose() {
    // 5d writes the world back here. Saying so out loud beats an empty hook
    // that reads as "nothing to do".
    if (this.session?.dirty) {
      console.warn(`[BuildRoom] ${this.roomId} disposed with unsaved edits (persistence lands in 5d)`);
    }
  }
}
