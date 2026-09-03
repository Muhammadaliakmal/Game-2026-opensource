import { Room, ServerError, type Client } from "colyseus";
import { z } from "zod";
import { RACE, Race, gridPose } from "../race.ts";
import { RaceState, Rider } from "../race-state.ts";
import { verifyJoin } from "../auth.ts";
import { getWorldSource } from "../world-source.ts";
import { GRID_YAW } from "@/lib/race-track";
import type { WorldDoc } from "@/lib/worlddoc";

/**
 * A race room: up to four riders, three laps, found by code.
 *
 * Same shape as ArenaRoom — the rules live in a pure class (race.ts) and this
 * is the transport around them. The two things the room owns that the race
 * cannot are the clock (a countdown ending is not something a rules object can
 * notice) and the world.
 *
 * The track is fixed rather than chosen. A lap only means anything on a closed
 * circuit, and the sector scheme in race-track.ts describes exactly one — so
 * offering a world picker here would be offering three worlds where the lap
 * counter silently never advances.
 */

const moveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
});

/** The one world a race can happen on. */
export const RACE_WORLD = "circuit";

export interface RaceOptions {
  code?: string;
}

export class RaceRoom extends Room<{ state: RaceState }> {
  maxClients = RACE.maxRiders;
  patchRate = 50;

  race!: Race;
  worldDoc!: WorldDoc;

  static async onAuth(token: string) {
    return verifyJoin(token);
  }

  async onCreate(options: RaceOptions) {
    const code = options?.code;
    if (!code) throw new ServerError(400, "code is required");

    const record = await getWorldSource().load(RACE_WORLD);
    if (!record) throw new ServerError(404, `world ${RACE_WORLD} not found`);

    // The track is scenery a race is run on, never something it edits.
    const doc = record.doc;
    this.worldDoc = doc;
    this.race = new Race();
    this.setState(new RaceState());
    this.state.laps = RACE.laps;
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
    for (const id of this.race.riders.keys()) this.syncRider(id);
  }
}
