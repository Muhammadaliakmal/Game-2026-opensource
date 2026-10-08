"use client";

import { relayConfig } from "./relays";
import { PartySession, type PartyMessage } from "./party-session";
import { networkRoom } from "./nearby";
import { resetPartyStore, usePartyStore, type PartyPhase } from "@/stores/party-store";

/**
 * Parties with no server: browsers connect to each other directly.
 *
 * WebRTC needs a short introduction before two browsers can talk — an
 * exchange of "here is how to reach me". Trystero carries that over public
 * Nostr relays (encrypted with the party code, so a relay sees noise), and
 * from then on everything goes browser to browser. On one Wi-Fi that is a
 * direct hop across the router; nothing of ours is in the loop, and there is
 * nothing to deploy or keep awake.
 *
 * Two kinds of room:
 * - **the party**, `party-<code>`: every member, fully connected; the rules
 *   are `PartySession` and `Party`.
 * - **the lobby**, one per network (`nearby.ts`): hosts announce their party
 *   there every few seconds, and the Party page lists what it hears.
 *
 * Trystero is imported lazily: a visitor who never opens a party never
 * downloads it.
 */

const APP_ID = "specdrivengames.com/party";
/** How long a guest waits for a host before being offered to host it themselves. */
const NO_HOST_MS = 15_000;
/** Snapshots coalesce over this window. See `SessionOptions.defer`. */
const PUBLISH_MS = 120;
const AD_EVERY_MS = 3000;

type TrysteroRoom = import("trystero").Room;
type Sender = (data: unknown, opts?: { target?: string }) => Promise<void>;

const trystero = () => import("trystero");

// ── The party ────────────────────────────────────────────────────────────

interface Live {
  code: string;
  room: TrysteroRoom;
  /** The cabinet's channel: one table's moves to the others (`host/net.ts`). */
  sendGame: Sender;
  session: PartySession;
  timers: number[];
  stopAds: (() => void) | null;
}

let live: Live | null = null;
let attempt = 0;
/**
 * The last party room's `leave()`. Rejoining the same code ("Host this
 * party", "Try again") must wait for it: Trystero hands back the room it
 * still holds for an id, and that one is about to be gone. See the lobby's
 * `LOBBY_LINGER_MS` for the same trap.
 */
let leaving: Promise<void> = Promise.resolve();

function mirror(session: PartySession, code: string, selfId: string) {
  const v = session.view;
  if (!v) return;
  usePartyStore.setState({
    status: "live",
    error: null,
    code,
    selfId,
    hostId: v.hostId,
    phase: v.phase as PartyPhase,
    game: v.game,
    seed: v.seed,
    round: v.round,
    members: [...v.members].sort((a, b) => a.order - b.order).map((m) => ({ ...m })),
    seats: [...(v.seats ?? [])],
    go: v.go ?? { href: "", n: 0 },
  });
}

/**
 * Join the party with this code. `creator` is the browser that pressed
 * "Start a party": it hosts from the first frame. Anyone else waits to hear
 * from a host.
 */
export async function joinParty(code: string, opts: { creator: boolean }): Promise<void> {
  leaveParty();
  const mine = ++attempt;
  usePartyStore.setState({ status: "connecting", error: null, code });

  let mod: Awaited<ReturnType<typeof trystero>>;
  try {
    await leaving;
    mod = await trystero();
  } catch {
    if (mine === attempt) usePartyStore.setState({ status: "error", error: "Could not load the party code. Check your connection." });
    return;
  }
  if (mine !== attempt) return;

  const room = mod.joinRoom({ appId: APP_ID, password: code, relayConfig }, `party-${code}`);
  const action = room.makeAction("p");
  const send = action.send as unknown as Sender;
  const game = room.makeAction("g");
  game.onMessage = (data, ctx) => {
    const g = data as unknown as { r: number; m: unknown };
    if (g && typeof g.r === "number") gameHandler?.(g.m, ctx.peerId, g.r);
  };
  const selfId = mod.selfId;

  const pending: number[] = [];
  const session = new PartySession({
    selfId,
    code,
    creator: opts.creator,
    send: (msg, to) => void send(msg, to ? { target: to } : undefined).catch(() => {}),
    onChange: () => {
      mirror(session, code, selfId);
      syncAds();
    },
    now: () => Date.now(),
    seed: () => crypto.getRandomValues(new Uint32Array(1))[0],
    defer: (fn) => {
      pending.push(window.setTimeout(fn, PUBLISH_MS));
    },
  });

  action.onMessage = (data, ctx) => session.receive(data as unknown as PartyMessage, ctx.peerId);
  room.onPeerJoin = (id) => session.peerJoined(id);
  room.onPeerLeave = (id) => session.peerLeft(id);

  const state: Live = {
    code,
    room,
    sendGame: game.send as unknown as Sender,
    session,
    timers: pending,
    stopAds: null,
  };
  live = state;
  state.timers.push(window.setInterval(() => session.tick(), 1000));
  state.timers.push(
    window.setTimeout(() => {
      if (live === state && !session.view) usePartyStore.setState({ status: "nohost" });
    }, NO_HOST_MS)
  );

  function syncAds() {
    if (live !== state) return;
    if (session.isHost && !state.stopAds) state.stopAds = advertise(() => state);
    else if (!session.isHost && state.stopAds) {
      state.stopAds();
      state.stopAds = null;
    }
  }

  if (session.view) {
    mirror(session, code, selfId);
    syncAds();
  }
}

export function leaveParty() {
  attempt++;
  const going = live;
  live = null;
  resetPartyStore();
  if (!going) return;
  for (const t of going.timers) {
    window.clearTimeout(t);
    window.clearInterval(t);
  }
  going.stopAds?.();
  leaving = going.room.leave().catch(() => {});
}

/** Where a table game's messages go. One at a time: there is one cabinet open. */
let gameHandler: ((msg: unknown, from: string, round: number) => void) | null = null;

export function onPartyGame(handler: typeof gameHandler) {
  gameHandler = handler;
}

/** A table game's message for this round: to one peer, or everyone. */
export function partyGameSend(round: number, msg: unknown, to?: string) {
  void live?.sendGame({ r: round, m: msg }, to ? { target: to } : undefined).catch(() => {});
}

export const partyPick = (game: string) => live?.session.pick(game);
export const partyStart = () => live?.session.start();
export const partyToLobby = () => live?.session.toLobby();
/** Host: send the whole party to a race or a course (`Party.go`). */
export const partyGo = (href: string) => live?.session.go(href);
export const partyScore = (n: number) => live?.session.score(n);
export const partyDone = (n: number) => live?.session.done(n);

// ── The lobby ────────────────────────────────────────────────────────────

export interface NearbyParty {
  code: string;
  host: string;
  game: string;
  phase: string;
  players: number;
}

interface Ad extends NearbyParty {
  t: "ad";
}

/**
 * One lobby connection per page, shared by the list on `/party` and a host's
 * own announcements, and closed when neither wants it.
 */
let lobby: Promise<{ room: TrysteroRoom; send: Sender; listeners: Set<(ad: Ad, from: string) => void>; joins: Set<(id: string) => void> } | null> | null = null;
let lobbyUsers = 0;
let lobbyIdle = 0;

/**
 * How long the lobby stays open after its last user lets go.
 *
 * Not tidiness. Starting a party is a navigation from `/party` (which holds
 * the lobby to list parties) to `/party/<code>` (which holds it to announce
 * one). Closing it on the first page and reopening on the second asked
 * Trystero for a room it was still leaving — and it hands back the room it
 * already has for that id, which was dead a moment later. The host's
 * announcements went nowhere and nobody nearby ever saw the party.
 */
const LOBBY_LINGER_MS = 15_000;

function acquireLobby() {
  lobbyUsers++;
  window.clearTimeout(lobbyIdle);
  lobby ??= (async () => {
    const [net, mod] = await Promise.all([networkRoom(), trystero()]);
    if (!net) return null;
    const room = mod.joinRoom({ appId: APP_ID, password: net, relayConfig }, net);
    const action = room.makeAction("ad");
    const listeners = new Set<(ad: Ad, from: string) => void>();
    const joins = new Set<(id: string) => void>();
    action.onMessage = (data, ctx) => {
      for (const l of listeners) l(data as unknown as Ad, ctx.peerId);
    };
    room.onPeerJoin = (id) => {
      for (const j of joins) j(id);
    };
    return { room, send: action.send as unknown as Sender, listeners, joins };
  })().catch(() => null);
  return lobby;
}

function releaseLobby() {
  lobbyUsers = Math.max(0, lobbyUsers - 1);
  if (lobbyUsers > 0 || !lobby) return;
  window.clearTimeout(lobbyIdle);
  lobbyIdle = window.setTimeout(() => {
    if (lobbyUsers > 0 || !lobby) return;
    const closing = lobby;
    lobby = null;
    void closing.then((l) => l?.room.leave());
  }, LOBBY_LINGER_MS);
}

/** While hosting: tell the network this party exists. Returns a stop. */
function advertise(current: () => Live | null): () => void {
  let stopped = false;
  let timer = 0;
  const handle = acquireLobby();
  const ad = (): Ad | null => {
    const l = current();
    const v = l?.session.view;
    if (!l || !v) return null;
    return {
      t: "ad",
      code: l.code,
      host: v.members.find((m) => m.id === v.hostId)?.name ?? "",
      game: v.game,
      phase: v.phase,
      players: v.members.length,
    };
  };
  void handle.then((lb) => {
    if (!lb || stopped) return;
    const shout = (to?: string) => {
      const a = ad();
      if (a) void lb.send(a, to ? { target: to } : undefined).catch(() => {});
    };
    // A browser that opens the Party page hears about us at once, not on the
    // next tick.
    const onJoin = (id: string) => shout(id);
    lb.joins.add(onJoin);
    shout();
    timer = window.setInterval(shout, AD_EVERY_MS);
    stop = () => {
      window.clearInterval(timer);
      lb.joins.delete(onJoin);
    };
  });
  let stop = () => {};
  return () => {
    stopped = true;
    stop();
    releaseLobby();
  };
}

/** An ad not repeated in this long is a party that has gone. */
const AD_TTL_MS = AD_EVERY_MS * 3;

/**
 * Listen for parties on this network. `onList` gets the current list on every
 * change, and `null` if this network cannot be identified (STUN blocked). The
 * returned function stops listening.
 */
export function watchNearby(onList: (parties: NearbyParty[] | null) => void): () => void {
  const seen = new Map<string, { ad: NearbyParty; at: number }>();
  let stopped = false;
  let timer = 0;
  const emit = () => {
    const now = Date.now();
    for (const [code, s] of seen) if (now - s.at > AD_TTL_MS) seen.delete(code);
    onList([...seen.values()].map((s) => s.ad));
  };
  const listener = (ad: Ad) => {
    if (ad?.t !== "ad" || typeof ad.code !== "string") return;
    seen.set(ad.code, {
      ad: { code: ad.code, host: String(ad.host ?? ""), game: String(ad.game ?? ""), phase: String(ad.phase ?? ""), players: Number(ad.players) || 1 },
      at: Date.now(),
    });
    emit();
  };
  void acquireLobby().then((lb) => {
    if (stopped) return;
    if (!lb) return onList(null);
    lb.listeners.add(listener);
    emit();
    timer = window.setInterval(emit, AD_EVERY_MS);
  });
  return () => {
    stopped = true;
    window.clearInterval(timer);
    void lobby?.then((lb) => lb?.listeners.delete(listener));
    releaseLobby();
  };
}
