"use client";

import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";
import { useArenaStore, type ArenaPhase, type FighterView } from "@/stores/arena-store";
import { requestRespawn } from "@/components/play/play-actions";
import { addPeer, clearPeers, pushSample, removePeer } from "./peers";
import { setPresenceSender } from "./presence";
import { MULTIPLAYER_URL, multiplayerEnabled } from "./room";
import { useNetStore } from "@/stores/net-store";

/**
 * A match connection.
 *
 * Separate from the build room (room.ts) because it is a different room type
 * with different messages — but it reuses the same peer map, so the avatars
 * that render the other builder render the other fighter with no extra code.
 */

interface FighterSchema {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  score: number;
  downed: boolean;
}

let room: Room | null = null;
let connecting = false;

export interface ArenaHandle {
  dispose(): void;
}

/**
 * Joins (or opens) the match with this code. `worldId` is only consulted when
 * the match does not exist yet — whoever follows the link inherits the world
 * the match was opened with.
 */
export async function joinMatch(
  code: string,
  worldId: string,
  onWorld: (doc: WorldDoc) => void
): Promise<() => void> {
  if (!multiplayerEnabled) {
    useArenaStore.getState().setConnection({
      connected: false,
      error: "Matches need a room server. Set NEXT_PUBLIC_MULTIPLAYER_URL.",
    });
    return () => {};
  }
  if (connecting || room) return () => {};
  connecting = true;

  const store = useArenaStore.getState();
  store.reset();

  try {
    const client = new Client(MULTIPLAYER_URL);
    const joined = await client.joinOrCreate("arena", { code, worldId });
    room = joined;
    connecting = false;
    store.setConnection({ connected: true, code, selfId: joined.sessionId, error: null });

    joined.onMessage("world", (message: { doc: unknown }) => {
      try {
        onWorld(parseWorldDoc(message.doc));
      } catch {
        store.setConnection({
          connected: true,
          error: "The match sent a world this build cannot read.",
        });
      }
    });

    // A knockdown is the server's call, so the teleport is too. requestRespawn
    // is the same one-shot the HUD's respawn button uses — the frame loop owns
    // moving the body, here as everywhere else.
    joined.onMessage("revive", (r: { id: string }) => {
      if (r.id === joined.sessionId) requestRespawn();
    });

    joined.onMessage("rematch", () => requestRespawn());

    joined.onMessage(
      "hit",
      (h: { by: string; target: string; knockdown: boolean }) => {
        if (h.target === joined.sessionId) useArenaStore.getState().flashHurt();
        else if (h.by === joined.sessionId) useArenaStore.getState().flashLanded();
      }
    );

    setPresenceSender((x, y, z, yaw) => joined.send("move", { x, y, z, yaw }));

    const $ = getStateCallbacks(joined);
    const syncMatch = () => {
      const state = joined.state as {
        phase: string;
        winner: string;
        fighters: Map<string, FighterSchema>;
      };
      const fighters: FighterView[] = [];
      state.fighters.forEach((f, id) => {
        fighters.push({ id, name: f.name, hp: f.hp, score: f.score, downed: f.downed });
      });
      useArenaStore.getState().setMatch({
        phase: (state.phase || "waiting") as ArenaPhase,
        winner: state.winner || null,
        fighters,
      });
    };

    $(joined.state).fighters.onAdd((fighter: FighterSchema, id: string) => {
      if (id !== joined.sessionId) {
        addPeer(
          id,
          fighter.name,
          { x: fighter.x, y: fighter.y, z: fighter.z, yaw: fighter.yaw, t: Date.now() },
          false // a fighter is never "building" — always drawn in the world
        );
        useNetStore.getState().addPeerId(id);
      }
      $(fighter).onChange(() => {
        if (id !== joined.sessionId) {
          pushSample(
            id,
            { x: fighter.x, y: fighter.y, z: fighter.z, yaw: fighter.yaw, t: Date.now() },
            false
          );
        }
        syncMatch();
      });
      syncMatch();
    });

    $(joined.state).fighters.onRemove((_f: FighterSchema, id: string) => {
      removePeer(id);
      useNetStore.getState().removePeerId(id);
      syncMatch();
    });

    $(joined.state).onChange(syncMatch);

    joined.onLeave(() => leaveMatch());

    return leaveMatch;
  } catch (e) {
    connecting = false;
    room = null;
    useArenaStore.getState().setConnection({
      connected: false,
      error:
        e instanceof Error && /full/i.test(e.message)
          ? "That match already has two fighters."
          : e instanceof Error
            ? e.message
            : "Could not join the match.",
    });
    return () => {};
  }
}

export function leaveMatch() {
  setPresenceSender(null);
  clearPeers();
  useNetStore.getState().reset();
  useArenaStore.getState().reset();
  const leaving = room;
  room = null;
  connecting = false;
  void leaving?.leave();
}

/** Swing. The server decides whether it landed — see server/src/arena-match.ts. */
export function attack() {
  room?.send("attack", {});
}

export function requestRematch() {
  room?.send("rematch", {});
}
