import { Room, ServerError, type AuthContext, type Client } from "colyseus";
import { z } from "zod";
import { Player, RoomPresence } from "../state.ts";
import { WorldSession } from "../world-session.ts";
import { getWorldSource } from "../world-source.ts";
import { WorldPersistence } from "../persist.ts";
import { anonymousRoomsAllowed, verifyJoin, type RoomIdentity } from "../auth.ts";
import { DEFAULT_CHARACTER, isCharacterId } from "@/lib/characters";

/**
 * One room per world. The room owns the authoritative WorldDoc; clients own
 * only their own view of it.
 *
 * This class is deliberately thin — every rule about what an edit may do lives
 * in WorldSession, which knows nothing about sockets, and every rule about
 * when it reaches the database lives in WorldPersistence, which knows nothing
 * about either. What is left here is the part that genuinely is networking:
 * who may join, what gets sent on join, and who hears about an accepted edit.
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

/** What onAuth hands to onJoin: who they are, and what they are allowed to do. */
export interface BuildIdentity extends RoomIdentity {
  canEdit: boolean;
}

export class BuildRoom extends Room<{ state: RoomPresence }> {
  maxClients = 16;
  /**
   * 50 ms. Presence is a handful of floats, and anything faster buys motion
   * the eye cannot resolve at the cost of bandwidth everyone pays.
   */
  patchRate = 50;

  session!: WorldSession;
  persistence!: WorldPersistence;

  /** Null when nobody owns this world — a built-in, which nobody may edit. */
  ownerId: string | null = null;
  published = false;
  builtIn = false;

  /**
   * The instance form, not the static one, and Colyseus will only honour one:
   * defining a static `onAuth` makes it ignore this method entirely
   * (MatchMaker checks for exactly that). It has to be this one, because the
   * question "may you edit this?" cannot be answered before the room knows
   * which world it is — and that is only true after onCreate.
   *
   * The cost is that an unauthenticated join still causes a room to be
   * created, and with it one world load. A room with nobody in it disposes
   * itself, so what that buys an attacker is a fetch of a world the app would
   * have served them anyway.
   */
  async onAuth(_client: Client, _options: BuildRoomOptions, context: AuthContext) {
    const identity = await verifyJoin(context.token ?? "");
    if (!this.canView(identity)) {
      // 404, not 403 — a private world should not confirm it exists, here any
      // more than in the app's own GET /api/worlds/:id.
      throw new ServerError(404, "World not found");
    }

    return { ...identity, canEdit: this.canEdit(identity) } satisfies BuildIdentity;
  }

  /**
   * Who may see this world.
   *
   * The same rule the app applies to reading one: published, built-in, or
   * yours. A room must not be an easier way in than the API it reads through.
   */
  private canView(identity: RoomIdentity): boolean {
    if (anonymousRoomsAllowed()) return true; // local development
    return this.published || this.builtIn || identity.userId === this.ownerId;
  }

  /**
   * Who may change this world.
   *
   * The owner, and nobody else. There is no collaborator model in the data —
   * no invitations, no shared worlds — so anything more generous here would be
   * inventing permissions the app has no way to grant or revoke. Everyone else
   * still joins: presence is the point of a room in Play mode, and watching
   * someone build is worth more than the empty room the alternative gives.
   */
  private canEdit(identity: RoomIdentity): boolean {
    if (anonymousRoomsAllowed()) return true; // local development
    if (identity.guest) return false;
    // A built-in has no owner and no row to save into. An edit here would live
    // until the last person left and then vanish, which is worse than refusing.
    if (this.builtIn || !this.ownerId) return false;
    return identity.userId === this.ownerId;
  }

  async onCreate(options: BuildRoomOptions) {
    const worldId = options?.worldId;
    if (!worldId) throw new ServerError(400, "worldId is required");

    const source = getWorldSource();
    const record = await source.load(worldId);
    // 404, not an empty room: joining a world that does not exist and being
    // handed a blank one is how someone loses an afternoon of building.
    if (!record) throw new ServerError(404, `world ${worldId} not found`);

    this.ownerId = record.ownerId;
    this.published = record.published;
    this.builtIn = record.builtIn;

    this.session = new WorldSession(record.doc);
    this.persistence = new WorldPersistence(worldId, this.session, (id, doc) =>
      source.save(id, doc)
    );
    this.setState(new RoomPresence());
    this.roomId = worldId;

    this.onMessage("op", (client, message) => {
      // The client already hides the tools when a world is not yours, so this
      // is not the check that shapes the UI — it is the one that holds when
      // somebody skips the UI entirely.
      if (!(client.auth as BuildIdentity | undefined)?.canEdit) {
        client.send("op-rejected", { reason: "read-only" });
        return;
      }

      const result = this.session.submit(client.sessionId, message);
      if (!result.ok) {
        // Told only to the sender: everyone else never saw the edit, so there
        // is nothing for them to reconcile.
        client.send("op-rejected", { reason: result.reason, detail: result.detail });
        return;
      }
      this.state.revision = result.revision;
      this.broadcast("op", result.op, { except: client });
      // A built-in has nowhere to be saved to; asking would be a POST that can
      // only ever 403.
      if (!this.builtIn) this.persistence.touch();
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

  onJoin(client: Client, options?: { character?: unknown }) {
    // The whole world in one message, then ops from here on. Sending it before
    // the player is added means a joiner never sees an op for a world they do
    // not have yet.
    //
    // `canEdit` rides along so the client knows immediately, rather than
    // discovering it by having its first placement yanked back out.
    const auth = client.auth as BuildIdentity | undefined;
    client.send("world", {
      doc: this.session.doc,
      revision: this.session.revision,
      canEdit: auth?.canEdit ?? false,
    });

    const [x, y, z] = this.session.doc.spawn;
    this.state.players.set(
      client.sessionId,
      new Player({
        name: auth?.name ?? "Builder",
        // Client-chosen, so it is run past the catalog rather than stored as
        // sent — an unchecked string here is a string that reaches a `useGLTF`
        // call on every other player's machine.
        character: isCharacterId(options?.character) ? options.character : DEFAULT_CHARACTER,
        x,
        y,
        z,
        yaw: 0,
        building: true,
      })
    );
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.session.forget(client.sessionId);
  }

  /**
   * The last edits of a session are the ones nobody has written yet. Colyseus
   * awaits this hook, so the process stays up long enough for the write.
   */
  async onDispose() {
    if (this.builtIn) return;
    await this.persistence?.dispose();
    if (this.session?.dirty) {
      console.error(`[BuildRoom] ${this.roomId} disposed with edits that could not be saved`);
    }
  }
}
