"use client";

import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { parseWorldDoc } from "@/lib/worlddoc";
import type { Op } from "@/lib/ops";
import { setOpSink, useEditorStore } from "@/stores/editor-store";
import { useNetStore } from "@/stores/net-store";
import { addPeer, clearPeers, pushSample, removePeer } from "./peers";
import { setPresenceSender } from "./presence";

/**
 * The room connection.
 *
 * Everything here is a no-op when NEXT_PUBLIC_MULTIPLAYER_URL is unset, which
 * is the default: the app must behave exactly as it did before Phase 5 until
 * someone deliberately points it at a room server.
 */
export const MULTIPLAYER_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? "";
export const multiplayerEnabled = MULTIPLAYER_URL.length > 0;

interface PlayerLike {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  building: boolean;
}

let room: Room | null = null;
let connecting = false;
let building = true;

/**
 * Joins the room for a world. Returns a disposer; calling it is the only way
 * a connection ever ends, so every caller must keep it.
 */
export async function connectToWorld(worldId: string): Promise<() => void> {
  if (!multiplayerEnabled || connecting || room) return () => {};
  connecting = true;

  const net = useNetStore.getState();
  net.setStatus("connecting");

  try {
    const client = new Client(MULTIPLAYER_URL);
    const joined = await client.joinOrCreate("build", { worldId });
    room = joined;
    connecting = false;

    net.setSelfId(joined.sessionId);
    net.setStatus("live");

    // The whole world, once. Ops carry it from here — see lib/ops.ts.
    joined.onMessage("world", (message: { doc: unknown }) => {
      try {
        useEditorStore.getState().loadDoc(parseWorldDoc(message.doc));
      } catch {
        net.setStatus("error", "The room sent a world this build cannot read.");
      }
    });

    joined.onMessage("op", (op: Op) => {
      useEditorStore.getState().applyRemoteOp(op);
    });

    // Our edit did not make it into the shared world, so our copy is now ahead
    // of everyone else's. Ask for the authoritative one back rather than
    // leaving two people building in worlds that quietly disagree.
    joined.onMessage("op-rejected", (rejection: { reason: string }) => {
      console.warn(`[net] edit rejected (${rejection.reason}) — resyncing`);
      joined.send("resync", {});
    });

    // Handlers are registered here, after `joinOrCreate` resolves, and the
    // room's onJoin snapshot still arrives — the SDK resolves the join before
    // it delivers room messages. (Sending an eager `resync` here instead does
    // NOT work: a message sent while the seat is still being consumed drops
    // the connection. The resync path above, after a rejection, is fine.)
    //
    // Local edits go out from here. Set AFTER the handlers above so an op can
    // never be sent to a room that is not listening yet.
    setOpSink((op) => joined.send("op", op));
    setPresenceSender((x, y, z, yaw) => joined.send("move", { x, y, z, yaw, building }));

    const $ = getStateCallbacks(joined);
    $(joined.state).players.onAdd((player: PlayerLike, id: string) => {
      if (id === joined.sessionId) return; // never render ourselves twice
      addPeer(
        id,
        player.name,
        { x: player.x, y: player.y, z: player.z, yaw: player.yaw, t: Date.now() },
        player.building
      );
      useNetStore.getState().addPeerId(id);

      $(player).onChange(() => {
        pushSample(
          id,
          { x: player.x, y: player.y, z: player.z, yaw: player.yaw, t: Date.now() },
          player.building
        );
      });
    });

    $(joined.state).players.onRemove((_player: PlayerLike, id: string) => {
      removePeer(id);
      useNetStore.getState().removePeerId(id);
    });

    joined.onLeave(() => disconnect());

    return disconnect;
  } catch (e) {
    connecting = false;
    room = null;
    // A refused join is not a broken app: the editor keeps working on its own
    // copy, which is exactly what it did before multiplayer existed.
    net.setStatus("error", e instanceof Error ? e.message : "Could not join the room.");
    return () => {};
  }
}

export function disconnect() {
  setOpSink(null);
  setPresenceSender(null);
  clearPeers();
  useNetStore.getState().reset();
  const leaving = room;
  room = null;
  connecting = false;
  void leaving?.leave();
}

/** Build and Play are one canvas; peers still need to know which one we are in. */
export function setPresenceMode(isBuilding: boolean) {
  building = isBuilding;
  if (!room) return;
  const player = (room.state as { players?: { get(id: string): PlayerLike | undefined } })
    .players?.get(room.sessionId);
  room.send("move", {
    x: player?.x ?? 0,
    y: player?.y ?? 0,
    z: player?.z ?? 0,
    yaw: player?.yaw ?? 0,
    building: isBuilding,
  });
}
