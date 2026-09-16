import { Room, ServerError, type Client } from "colyseus";
import { z } from "zod";
import { RACE, Race, gridPose } from "../race.ts";
import { RaceState, Rider } from "../race-state.ts";
import { verifyJoin, type RoomIdentity } from "../auth.ts";
import { getWorldSource } from "../world-source.ts";
import { getRewardSink } from "../rewards.ts";
import { GRID_YAW, raceTrackSlug } from "@/lib/race-track";
import type { WorldDoc } from "@/lib/worlddoc";

/**
 * A race room: up to four riders, three laps, found by code.
 *
 * The rules live in a pure class (race.ts) and this is the transport around
 * them. The two things the room owns that the race
 * cannot are the clock (a countdown ending is not something a rules object can
 * notice) and the world.
 *
 * The track is chosen once, when the room is created, from a fixed set
 * (`RACE_TRACKS` in race-track.ts). Every one of them shares the circuit's XZ
 * shape, so the sector scheme and the lap counter here are identical whichever
 * is picked — the difference is elevation, which the lap counter never sees. A
 * client cannot name an arbitrary world: `raceTrackSlug` maps an unknown id
 * back to the default.
 */

const moveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
});

export interface RaceOptions {
  code?: string;
  /**
   * How many riders the grid should wait for, 1-4.
   *
   * Only the client that CREATES the room is heard — `joinOrCreate` passes the
   * same options to a join, and letting a late arrival silently resize a grid
   * that people are already waiting on is not a thing anybody asked for. The
   * explicit `target` message below is how it is changed after the fact, and
   * that one is deliberately open to any rider in the room.
   */
  target?: number;
  /**
   * Which track to run, as a `RACE_TRACKS` id. Heard only on create, exactly
   * like `target`: someone opening a shared `/race/CODE?track=…` link joins
   * the room the way its creator built it, whatever the link says. Unknown or
   * absent falls back to the default rather than refusing the join.
   */
  track?: string;
}

export class RaceRoom extends Room<{ state: RaceState }> {
  maxClients = RACE.maxRiders;
  patchRate = 50;

  race!: Race;
  worldDoc!: WorldDoc;
  /**
   * How many riders the lights went out for. Read when a finish is paid,
   * rather than `riders.size` at that moment: a winner who leaves the room
   * the second they cross the line would otherwise turn everybody behind
   * them into a "time trial" and pay them as one.
   */
  private entrants = 0;

  static async onAuth(token: string) {
    return verifyJoin(token);
  }

  async onCreate(options: RaceOptions) {
    const code = options?.code;
    if (!code) throw new ServerError(400, "code is required");

    const worldId = raceTrackSlug(options?.track);
    const record = await getWorldSource().load(worldId);
    if (!record) throw new ServerError(404, `world ${worldId} not found`);

    // The track is scenery a race is run on, never something it edits.
    const doc = record.doc;
    this.worldDoc = doc;
    this.race = new Race();
    this.setState(new RaceState());
    this.state.laps = RACE.laps;
    this.race.setTarget(options?.target ?? RACE.minAutoStart, Date.now());
    this.state.target = this.race.target;
    this.roomId = code;

    this.onMessage("move", (client, message) => {
      const parsed = moveSchema.safeParse(message);
      if (!parsed.success) return;

      const before = this.race.phase;
      const result = this.race.move(client.sessionId, parsed.data, Date.now());
      this.syncRider(client.sessionId);

      if (result.finished) {
        const r = this.race.riders.get(client.sessionId);
        this.broadcast("finish", {
          id: client.sessionId,
          place: r?.place ?? 0,
          timeMs: r?.timeMs ?? 0,
        });
        this.reward(client, r?.place ?? 0);
      } else if (result.lapped) {
        // Only the rider needs this — it is the "new lap" beat on their own
        // HUD, not news for anybody else.
        client.send("lap", { lap: this.race.riders.get(client.sessionId)?.lap });
      }
      if (this.race.phase !== before) this.sync();
    });

    // Any rider may start the lights early. That is what lets one person
    // practise alone, and it costs nothing: a race with one entrant is a time
    // trial, which is a perfectly good thing to want.
    this.onMessage("start", (client) => {
      if (!this.race.riders.has(client.sessionId)) return;
      if (this.race.arm(Date.now())) {
        this.sync();
        this.broadcast("grid", this.gridFor());
      }
    });

    // Resizing the grid while it waits. Any rider, not just whoever opened the
    // room: there is no host concept in this game, and inventing one so that a
    // race can be resized would be a permissions model built for one button.
    this.onMessage("target", (client, message) => {
      if (!this.race.riders.has(client.sessionId)) return;
      const n = Number((message as { target?: unknown })?.target);
      if (!Number.isFinite(n)) return;
      if (this.race.setTarget(n, Date.now())) {
        this.sync();
        if (this.race.phase === "countdown") {
          this.broadcast("grid", this.gridFor());
        }
      }
    });

    this.onMessage("rematch", (client) => {
      if (!this.race.riders.has(client.sessionId)) return;
      this.race.rematch(Date.now());
      this.sync();
      this.broadcast("grid", this.gridFor());
    });

    /**
     * The clock, at 10 Hz.
     *
     * Fast enough that a countdown reads smoothly and the green light is never
     * more than 100 ms late, which is inside what anyone can perceive on a
     * start line — and far cheaper than running it per frame for a room that
     * holds four people.
     */
    this.setSimulationInterval(() => {
      const now = Date.now();
      const changed = this.race.tick(now);
      const remaining =
        this.race.phase === "countdown"
          ? Math.max(0, this.race.startsAt - now)
          : 0;

      if (this.state.countdownMs !== remaining) {
        this.state.countdownMs = Math.min(65535, remaining);
      }
      if (changed) {
        // No separate "go" broadcast. The lights and the GO flash both read
        // `phase` off the schema state, which `sync()` has just pushed — so a
        // message alongside it was a second channel saying the same thing, and
        // the client never registered a handler for it. Colyseus logged an
        // "onMessage() not registered for type 'go'" warning on every start.
        this.sync();
      }
    }, 100);
  }

  /**
   * A finish is paid, once, to whoever crossed the line — not to guests,
   * who have no wallet. The grid size travels with the result so the app
   * can tell a race from a time trial; the app decides what it is worth.
   * Fire-and-forget: the room never waits on the wallet.
   */
  private reward(client: Client, place: number) {
    const who = client.auth as RoomIdentity | undefined;
    if (!who || who.guest) return;
    getRewardSink()
      .pay({ userId: who.userId, mode: "race", place, entrants: this.entrants })
      .then((paid) => {
        // The wallet answered after the rider may have left. Colyseus throws
        // on a send to a closed transport, and a payout that arrived after
        // its rider is not worth a stack trace.
        if (paid && paid.earned > 0 && this.clients.includes(client)) client.send("coins", paid);
      })
      .catch((error) => console.error(`[race ${this.roomId}] reward failed`, error));
  }

  onJoin(client: Client) {
    const auth = client.auth as { name?: string } | undefined;
    const rider = this.race.join(
      client.sessionId,
      auth?.name ?? "Rider",
      Date.now()
    );
    // maxClients should make this unreachable; refusing explicitly beats a
    // fifth person standing on a four-slot grid.
    if (!rider) throw new ServerError(409, "This race is full");

    client.send("world", {
      doc: this.worldDoc,
      spawn: [rider.x, rider.y, rider.z],
      yaw: GRID_YAW,
    });

    this.state.riders.set(
      client.sessionId,
      new Rider({
        name: rider.name,
        x: rider.x,
        y: rider.y,
        z: rider.z,
        yaw: GRID_YAW,
        lap: rider.lap,
        progress: rider.progress,
        place: rider.place,
        timeMs: rider.timeMs,
      })
    );
    this.sync();
    this.broadcast("grid", this.gridFor());
  }

  onLeave(client: Client) {
    this.race.leave(client.sessionId);
    this.state.riders.delete(client.sessionId);
    this.sync();
  }

  /** Where each rider should put itself when the grid is (re)formed. */
  private gridFor() {
    const out: Record<string, { x: number; y: number; z: number; yaw: number }> =
      {};
    for (const [id, r] of this.race.riders) {
      const pose = gridPose(r.slot);
      out[id] = { ...pose, yaw: GRID_YAW };
    }
    return out;
  }

  /** Mirrors one rider's live numbers. The race is the truth. */
  private syncRider(id: string) {
    const r = this.race.riders.get(id);
    const s = this.state.riders.get(id);
    if (!r || !s) return;
    s.x = r.x;
    s.y = r.y;
    s.z = r.z;
    s.yaw = r.yaw;
    s.lap = r.lap;
    s.progress = r.progress;
    s.place = r.place;
    s.timeMs = r.timeMs;
  }

  private sync() {
    this.state.phase = this.race.phase;
    this.state.target = this.race.target;
    for (const id of this.race.riders.keys()) this.syncRider(id);
    // The grid is counted while it forms and frozen once it is off; a
    // rematch goes back through "waiting" and counts again.
    if (this.race.phase === "waiting") this.entrants = 0;
    else if (this.race.phase === "countdown") this.entrants = Math.max(this.entrants, this.race.riders.size);
  }
}
