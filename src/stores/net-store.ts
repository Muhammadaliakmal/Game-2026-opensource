import { create } from "zustand";

/**
 * The React-visible half of multiplayer: who is here and whether we are
 * connected. Peer *motion* deliberately does not live here — see lib/net/peers.ts.
 */
export type NetStatus = "off" | "connecting" | "live" | "error";

interface NetState {
  status: NetStatus;
  /** Session ids of everyone else in the room. Never includes us. */
  peerIds: string[];
  selfId: string | null;
  error: string | null;

  setStatus(status: NetStatus, error?: string | null): void;
  setSelfId(id: string | null): void;
  addPeerId(id: string): void;
  removePeerId(id: string): void;
  reset(): void;
}

export const useNetStore = create<NetState>((set) => ({
  status: "off",
  peerIds: [],
  selfId: null,
  error: null,

  setStatus: (status, error = null) => set({ status, error }),
  setSelfId: (selfId) => set({ selfId }),
  addPeerId: (id) =>
    set((s) => (s.peerIds.includes(id) ? s : { peerIds: [...s.peerIds, id] })),
  removePeerId: (id) => set((s) => ({ peerIds: s.peerIds.filter((p) => p !== id) })),
  reset: () => set({ status: "off", peerIds: [], selfId: null, error: null }),
}));
