"use client";

import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { roomToken } from "./token";
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

/**
 * How often rider state is allowed to reach React.
 *
 * Every rider's schema fires onChange on every position packet, so with four
 * riders at ~12 Hz the naive version wrote to the store around fifty times a
 * second — each write allocating a fresh array and re-rendering the whole HUD,
 * including a sort, to move a running order that changes perhaps twice a lap.
 *
 * Coalescing to ~7 Hz is still four times faster than anyone reads a position
 * board. A phase change jumps the queue, because the start lights and the
 * results panel are the two things that must never feel late.
 */
const HUD_SYNC_MS = 140;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function clearSyncTimer() {
  if (syncTimer !== null) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

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
 * `track` and `target` are both create-only, unlike a duel's world: they reach
 * the server through `joinOrCreate` options, which it honours when this call
 * creates the room and ignores on a join. So the person who opens a grid picks
 * the track and its size, and everyone following the shared link races what
 * they built — the sector scheme is the same for every track, so the lap
 * counter does not care which one it was.
 */
export async function joinRace(
  code: string,
  onWorld: (doc: WorldDoc) => void,
  /**
   * How many riders this grid should wait for, if we are the one opening it.
   *
   * Passed to `joinOrCreate`, so it only takes effect when this call actually
   * creates the room — the server ignores it on a join for exactly that
   * reason. Somebody arriving at a grid of four does not get to quietly turn
   * it into a grid of two.
   */
  target?: number,
  /** Which track to build the grid on, if we are the one opening it. */
  track?: string
): Promise<() => void> {
  if (!multiplayerEnabled) {
    useRaceStore.getState().setConnection({
      connected: false,
      error:
        "Races need the room server. Start it with `cd server && npm run dev`, " +
        "then set NEXT_PUBLIC_MULTIPLAYER_URL (e.g. ws://localhost:2567) and reload.",
    });
    return () => {};
  }
  if (connecting || room) return () => {};
  connecting = true;

  const store = useRaceStore.getState();
  store.reset();

  try {
    const client = new Client(MULTIPLAYER_URL);
    const token = await roomToken();
    if (token) client.auth.token = token;
    const joined = await client.joinOrCreate("race", { code, target, track });
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

    const flush = () => {
      clearSyncTimer();
      const state = joined.state as {
        phase: string;
        laps: number;
        countdownMs: number;
        target: number;
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
        target: state.target || 2,
        riders,
      });
    };

    /**
     * Rate-limits rider updates into React, but never a phase change.
     *
     * The phase check reads the schema directly rather than the store, so a
     * lights-out that arrives in the same tick as a position update is not
     * held behind that update's timer.
     */
    const syncRace = () => {
      const phase = (joined.state as { phase: string }).phase || "waiting";
      if (phase !== useRaceStore.getState().phase) {
        flush();
        return;
      }
      if (syncTimer !== null) return;
      syncTimer = setTimeout(flush, HUD_SYNC_MS);
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
  clearSyncTimer();
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

/**
 * Change how many riders the grid waits for.
 *
 * Open to anyone in the room rather than to a host, because this game has no
 * host: a race is a code people have, and inventing an owner so that one
 * person may resize the grid would be a permissions model built for one
 * control. The server clamps it and refuses it once the lights are running.
 */
export function requestGridSize(target: number) {
  room?.send("target", { target });
}
