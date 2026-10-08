/**
 * A cabinet's line to the other players in a party match.
 *
 * The cabinet does not know what a party is. It is told which seat is its
 * own, who sits in the others, whether it is the table that decides (the
 * HOST) — and it gets a pipe. `components/party/PartyBridge.tsx` builds one of
 * these for a round of a `seats` or `duel` game and `GameHost` hands it to the
 * cabinet as `GameServices.net`. A solo run has none, and every cabinet that
 * reads it must behave exactly as before when it is absent.
 *
 * Messages are ordered and reliable (one WebRTC data channel per peer), and
 * the bridge queues any that arrive before the cabinet has set `onMessage` —
 * a guest whose cabinet loads more slowly than the host's still sees every
 * decision, in order.
 */

export interface NetPlayer {
  /** Party member id. */
  id: string;
  name: string;
}

export interface CabinetNet {
  /** This player's seat. */
  readonly seat: number;
  /** Seated players in seat order. A seat past the end is a bot (or the CPU). */
  readonly players: readonly NetPlayer[];
  /** The table that decides. Guests replay it. */
  readonly isHost: boolean;
  /** Host: to every guest. Guest: to the host. */
  send(msg: unknown): void;
  /** Set by the cabinet. `fromSeat` is the sender's seat, -1 if unknown. */
  onMessage: ((msg: unknown, fromSeat: number) => void) | null;
  /** Seats whose player has left the party. The host plays for them. */
  readonly gone: ReadonlySet<number>;
}

let current: CabinetNet | null = null;

export function setCabinetNet(net: CabinetNet | null) {
  current = net;
}

export function getCabinetNet(): CabinetNet | null {
  return current;
}
