import { create } from "zustand";

/**
 * The React-visible half of a party: who is here, what is being played, and
 * the running scores. Rebuilt whole from the host's snapshot every time —
 * eight members and five fields is cheaper to copy than to diff, and a copy
 * can never drift from the host the way a hand-maintained mirror can.
 *
 * The connection itself is `lib/net/party.ts`.
 */

export type PartyStatus = "off" | "connecting" | "live" | "nohost" | "error";
export type PartyPhase = "lobby" | "playing" | "results";

export interface PartyMemberView {
  id: string;
  name: string;
  order: number;
  playing: boolean;
  score: number;
  done: boolean;
}

interface PartyStoreState {
  status: PartyStatus;
  error: string | null;
  code: string | null;
  selfId: string | null;
  hostId: string;
  phase: PartyPhase;
  game: string;
  seed: number;
  round: number;
  members: PartyMemberView[];
}

const initial: PartyStoreState = {
  status: "off",
  error: null,
  code: null,
  selfId: null,
  hostId: "",
  phase: "lobby",
  game: "",
  seed: 0,
  round: 0,
  members: [],
};

export const usePartyStore = create<PartyStoreState>(() => initial);

export const resetPartyStore = () => usePartyStore.setState(initial, true);

/** Whether the local player is the host. */
export const selectIsHost = (s: PartyStoreState) => s.selfId !== null && s.selfId === s.hostId;
