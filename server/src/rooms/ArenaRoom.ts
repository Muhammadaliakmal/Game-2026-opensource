import { Room, ServerError, type Client } from "colyseus";
import { z } from "zod";
import { ARENA, ArenaMatch } from "../arena-match.ts";
import { ArenaState, Fighter } from "../arena-state.ts";
import { verifyJoin, type RoomIdentity } from "../auth.ts";
import { getRewardSink } from "../rewards.ts";
import { getWorldSource } from "../world-source.ts";
import type { Vec3, WorldDoc } from "@/lib/worlddoc";

/**
 * A match room: two people, one world, first to five knockdowns.
 *
 * Same shape as BuildRoom — the rules live in a pure class (arena-match.ts)
 * and this is the transport around them. The one thing the room owns that the
 * match cannot is the clock: knockdowns stand back up on a timer, and only
 * something with a socket knows when to tell everyone.
 *
 * Rooms are found by `code`, not by world, so two people can share a link to
 * their own match without it colliding with anybody else's.
 */

const moveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
});

export interface ArenaOptions {
  code?: string;
  worldId?: string;
}

export class ArenaRoom extends Room<{ state: ArenaState }> {
  maxClients = ARENA.maxFighters;
  patchRate = 50;

  match!: ArenaMatch;
  worldDoc!: WorldDoc;

  static async onAuth(token: string) {
    return verifyJoin(token);
  }

  async onCreate(options: ArenaOptions) {
    const code = options?.code;
    if (!code) throw new ServerError(400, "code is required");

    // The world is the arena floor. Whoever creates the match picks it; anyone
    // joining by link inherits it, which is why the second client's worldId is
    // never consulted.
    const record = await getWorldSource().load(options.worldId ?? "parkour");
    if (!record) throw new ServerError(404, `world ${options.worldId} not found`);

    // A match never edits the world, so ownership is beside the point here —
    // the floor is scenery, and everyone standing on it may as well be a guest.
    const doc = record.doc;
    this.worldDoc = doc;
    this.match = new ArenaMatch(doc.spawn as Vec3);
    this.setState(new ArenaState());
    this.roomId = code;

    this.onMessage("move", (client, message) => {
      const parsed = moveSchema.safeParse(message);
      if (!parsed.success) return;
      this.match.move(client.sessionId, parsed.data);

      const f = this.state.fighters.get(client.sessionId);
      if (!f) return;
      f.x = parsed.data.x;
      f.y = parsed.data.y;
      f.z = parsed.data.z;
      f.yaw = parsed.data.yaw;
    });

    this.onMessage("attack", (client) => {
      const result = this.match.attack(client.sessionId, Date.now());
      // The attacker always hears back. A swing that produced nothing still
      // needs to feel like it happened, and "why did nothing occur" is the
      // fastest way to make a fight feel broken.
      client.send("swing", result);
      if (!result.ok) return;

      this.sync();
      this.broadcast("hit", {
        by: client.sessionId,
        target: result.targetId,
        hp: result.hp,
        knockdown: result.knockdown,
        winner: result.winner,
      });
      if (result.winner) this.reward(result.winner);
    });

    this.onMessage("rematch", () => {
      this.match.rematch(Date.now());
      this.sync();
      this.broadcast("rematch", { spawn: this.worldDoc!.spawn });
    });

    // Respawns. 200 ms is well under the delay it is watching for, and a fight
    // is only ever two people — there is nothing here worth a tighter loop.
    this.setSimulationInterval(() => {
      const revived = this.match.tick(Date.now());
      if (revived.length === 0) return;
      this.sync();
      for (const r of revived) this.broadcast("revive", r);
    }, 200);
  }

  /**
   * The match is over: both fighters are paid for the result — the winner
   * more, the loser something for having fought it out. Guests have no
   * wallet and are skipped. The app decides the amounts; see rewards.ts.
   */
  private reward(winnerId: string) {
    for (const client of this.clients) {
      const who = client.auth as RoomIdentity | undefined;
      if (!who || who.guest || !this.match.fighters.has(client.sessionId)) continue;
      getRewardSink()
        .pay({
          userId: who.userId,
          mode: "arena",
          won: client.sessionId === winnerId,
          entrants: this.match.fighters.size,
        })
        .then((paid) => {
          if (paid && paid.earned > 0) client.send("coins", paid);
        })
        .catch((error) => console.error(`[arena ${this.roomId}] reward failed`, error));
    }
  }

  onJoin(client: Client) {
    const auth = client.auth as { name?: string } | undefined;
    const fighter = this.match.join(client.sessionId, auth?.name ?? "Fighter", Date.now());
    // maxClients should make this unreachable; refusing explicitly beats a
    // third person standing in a duel they are not part of.
    if (!fighter) throw new ServerError(409, "This match is full");

    client.send("world", { doc: this.worldDoc, spawn: this.worldDoc!.spawn });
    this.state.fighters.set(
      client.sessionId,
      new Fighter({
        name: fighter.name,
        x: fighter.x,
        y: fighter.y,
        z: fighter.z,
        yaw: 0,
        hp: fighter.hp,
        score: fighter.score,
        downed: false,
      })
    );
    this.sync();
  }

  onLeave(client: Client) {
    this.match.leave(client.sessionId, Date.now());
    this.state.fighters.delete(client.sessionId);
    this.sync();
  }

  /** Mirrors the match into the synchronised state. The match is the truth. */
  private sync() {
    this.state.phase = this.match.phase;
    this.state.winner = this.match.winner ?? "";
    for (const [id, f] of this.match.fighters) {
      const s = this.state.fighters.get(id);
      if (!s) continue;
      s.hp = f.hp;
      s.score = f.score;
      s.downed = f.downedAt !== null;
      // Position is mirrored too: a respawn moves a fighter without anybody
      // having sent a "move", and the other client has to see it.
      s.x = f.x;
      s.y = f.y;
      s.z = f.z;
    }
  }
}
