"use client";

import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";
import {
  useRaceStore,
  type RacePhase,
  type RiderView,
} from "@/stores/race-store";
import { addPeer, clearPeers, pushSample, removePeer } from "./peers";
import { setPresenceSender } from "./presence";
import { MULTIPLAYER_URL, multiplayerEnabled } from "./room";
import { useNetStore } from "@/stores/net-store";

/**
 * A race connection.
 *
 * Separate from the duel (arena.ts) because it is a different room with
 * different messages — but it reuses the same peer map, so the interpolation
 * that draws the other builder and the other fighter draws the other rider too,
 * with no extra code. Only the model on top of it differs.
 */

interface RiderSchema {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  lap: number;
  progress: number;
  place: number;
  timeMs: number;
}

let room: Room | null = null;
let connecting = false;

/** Where the server wants this bike to sit when the grid forms. */
export interface GridPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

type GridListener = (pose: GridPose) => void;
let onGrid: GridListener | null = null;

/**
 * The bike registers here to be told where to line up.
 *
 * A push rather than store state: placing a rigid body is a frame-loop job (the
 * same reason play-actions.ts exists for respawns), and routing it through
 * React would mean a render deciding when physics moves.
 */
export function setGridListener(fn: GridListener | null) {
  onGrid = fn;
}

/**
 * Joins (or opens) the race with this code.
 *
 * There is no world parameter, unlike a duel: laps only mean anything on a
 * closed circuit and the sector scheme describes exactly one, so the track is
 * the room's decision and not the joiner's.
 */
export async function joinRace(
  code: string,
  onWorld: (doc: WorldDoc) => void
): Promise<() => void> {
  if (!multiplayerEnabled) {
    useRaceStore.getState().setConnection({
      connected: false,
      error: "Races need a room server. Set NEXT_PUBLIC_MULTIPLAYER_URL.",
    });
    return () => {};
  }
  if (connecting || room) return () => {};
  connecting = true;

  const store = useRaceStore.getState();
  store.reset();

  try {
    const client = new Client(MULTIPLAYER_URL);
    const joined = await client.joinOrCreate("race", { code });
    room = joined;
    connecting = false;
    store.setConnection({
      connected: true,
      code,
      selfId: joined.sessionId,
      error: null,
    });

    joined.onMessage("world", (message: { doc: unknown }) => {
      try {
        onWorld(parseWorldDoc(message.doc));
      } catch {
        store.setConnection({
          connected: true,
          error: "The race sent a track this build cannot read.",
        });
      }
    });

    // Forming the grid is the server's call, so the teleport is too.
    joined.onMessage("grid", (poses: Record<string, GridPose>) => {
      const mine = poses[joined.sessionId];
      if (mine) onGrid?.(mine);
    });

    setPresenceSender((x, y, z, yaw) => joined.send("move", { x, y, z, yaw }));

    const $ = getStateCallbacks(joined);
    const syncRace = () => {
      const state = joined.state as {
        phase: string;
        laps: number;
        countdownMs: number;
        riders: Map<string, RiderSchema>;
      };
      const riders: RiderView[] = [];
      state.riders.forEach((r, id) => {
        riders.push({
          id,
          name: r.name,
          lap: r.lap,
          progress: r.progress,
          place: r.place,
          timeMs: r.timeMs,
        });
      });
      useRaceStore.getState().setRace({
        phase: (state.phase || "waiting") as RacePhase,
        laps: state.laps || 3,
        countdownMs: state.countdownMs || 0,
        riders,
      });
    };

    $(joined.state).riders.onAdd((rider: RiderSchema, id: string) => {
      if (id !== joined.sessionId) {
        addPeer(
          id,
          rider.name,
          { x: rider.x, y: rider.y, z: rider.z, yaw: rider.yaw, t: Date.now() },
          // A rider is never "building" — always drawn out on the track.
          false
        );
        useNetStore.getState().addPeerId(id);
      }
      $(rider).onChange(() => {
        if (id !== joined.sessionId) {
          pushSample(
            id,
            { x: rider.x, y: rider.y, z: rider.z, yaw: rider.yaw, t: Date.now() },
            false
          );
        }
        syncRace();
      });
      syncRace();
    });

    $(joined.state).riders.onRemove((_r: RiderSchema, id: string) => {
      removePeer(id);
      useNetStore.getState().removePeerId(id);
      syncRace();
    });

    $(joined.state).onChange(syncRace);

    joined.onLeave(() => leaveRace());

    return leaveRace;
  } catch (e) {
    connecting = false;
    room = null;
    useRaceStore.getState().setConnection({
      connected: false,
      error:
        e instanceof Error && /full/i.test(e.message)
          ? "That race already has four riders."
          : e instanceof Error
            ? e.message
            : "Could not join the race.",
    });
    return () => {};
  }
}

export function leaveRace() {
  setPresenceSender(null);
  setGridListener(null);
  clearPeers();
  useNetStore.getState().reset();
  useRaceStore.getState().reset();
  const leaving = room;
  room = null;
  connecting = false;
  void leaving?.leave();
}

/** Start the lights early — which is also how one person runs a time trial. */
export function requestStart() {
  room?.send("start", {});
}

export function requestRaceRematch() {
  room?.send("rematch", {});
}
