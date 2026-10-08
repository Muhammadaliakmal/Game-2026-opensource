"use client";

import { create } from "zustand";
import { relayConfig } from "./relays";
import { addPeer, clearPeers, peerMap, pushSample, removePeer } from "./peers";
import { setPresenceSender } from "./presence";
import { useNetStore } from "@/stores/net-store";
import { useCourse } from "@/components/play/course";
import { useShop } from "@/lib/shop";
import { guestName } from "@/lib/party-games";

/**
 * Playing a parkour course together, with no server.
 *
 * Everyone on `/play/<course>?together=<code>` joins one room and sends their
 * position straight to everyone else, twelve times a second — into the same
 * peer map the build room used to fill (`peers.ts`), so `Peers.tsx` draws the
 * other runners with the code it always had. Finish times go round the same
 * way and the HUD's together chip (`TogetherChip.tsx`) shows them: the race
 * is to the goal, the board is everyone's best.
 *
 * The world id rides on every message, so a stale link on another course
 * never puts a stranger's runner in yours.
 */

const APP_ID = "specdrivengames.com/together";

export interface TogetherRunner {
  id: string;
  name: string;
  best: number | null;
}

interface TogetherState {
  code: string | null;
  selfName: string;
  /** Everyone else in the room, in arrival order. */
  runners: TogetherRunner[];
  /** Our own best this session, for the board. */
  best: number | null;
}

export const useTogether = create<TogetherState>(() => ({ code: null, selfName: "", runners: [], best: null }));

type Msg =
  | { t: "p"; w: string; x: number; y: number; z: number; yaw: number }
  | { t: "hi"; w: string; name: string; ch: string; best: number | null }
  | { t: "fin"; w: string; ms: number };

type Sender = (data: unknown, opts?: { target?: string }) => Promise<void>;

let current: { leave: () => void } | null = null;
let attempt = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A name from the peer id: the same on every screen, and never typed. */
function nameFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return guestName(h % 100);
}

export async function joinTogether(code: string, worldId: string): Promise<void> {
  leaveTogether();
  const mine = ++attempt;
  const mod = await import("trystero").catch(() => null);
  if (!mod || mine !== attempt) return;

  const room = mod.joinRoom({ appId: APP_ID, password: code, relayConfig }, `play-${code}`);
  const action = room.makeAction("t");
  const send = action.send as unknown as Sender;
  const selfName = nameFor(mod.selfId);
  useTogether.setState({ code, selfName, runners: [], best: null });

  const hello = (to?: string) =>
    void send(
      { t: "hi", w: worldId, name: selfName, ch: useShop.getState().character, best: useTogether.getState().best } satisfies Msg,
      to ? { target: to } : undefined
    ).catch(() => {});

  const upsert = (id: string, patch: Partial<TogetherRunner>) => {
    const list = useTogether.getState().runners;
    const at = list.findIndex((r) => r.id === id);
    const next = at >= 0 ? list.map((r, i) => (i === at ? { ...r, ...patch } : r)) : [...list, { id, name: nameFor(id), best: null, ...patch }];
    useTogether.setState({ runners: next });
  };

  /** Characters, from each runner's hello, for when their first position arrives. */
  const characters = new Map<string, string>();

  room.onPeerJoin = (id) => hello(id);
  room.onPeerLeave = (id) => {
    removePeer(id);
    useNetStore.getState().removePeerId(id);
    useTogether.setState({ runners: useTogether.getState().runners.filter((r) => r.id !== id) });
  };

  action.onMessage = ((data: Msg, ctx: { peerId: string }) => {
    if (!data || data.w !== worldId) return;
    const id = ctx.peerId;
    if (data.t === "hi") {
      upsert(id, { name: String(data.name).slice(0, 24), best: typeof data.best === "number" ? data.best : null });
      // The runner is drawn from its first real position, not from here: a
      // placeholder pose would be interpolated from, and they would fly in.
      if (data.ch) characters.set(id, String(data.ch));
    } else if (data.t === "p") {
      if (![data.x, data.y, data.z, data.yaw].every(Number.isFinite)) return;
      const sample = { x: data.x, y: data.y, z: data.z, yaw: data.yaw, t: Date.now() };
      if (!peerMap().has(id)) {
        addPeer(id, nameFor(id), sample, false, characters.get(id));
        useNetStore.getState().addPeerId(id);
        upsert(id, {});
      } else pushSample(id, sample, false);
    } else if (data.t === "fin" && Number.isFinite(data.ms)) {
      const prev = useTogether.getState().runners.find((r) => r.id === id)?.best ?? null;
      upsert(id, { best: prev === null ? data.ms : Math.min(prev, data.ms) });
    }
  }) as never;

  setPresenceSender((x, y, z, yaw) =>
    void send({ t: "p", w: worldId, x: r2(x), y: r2(y), z: r2(z), yaw: r2(yaw) } satisfies Msg).catch(() => {})
  );

  // Every finish goes round. The course store already holds the time.
  const offCourse = useCourse.subscribe((s, prev) => {
    if (s.finishedMs === null || s.finishedMs === prev.finishedMs) return;
    const best = useTogether.getState().best;
    useTogether.setState({ best: best === null ? s.finishedMs : Math.min(best, s.finishedMs) });
    void send({ t: "fin", w: worldId, ms: s.finishedMs } satisfies Msg).catch(() => {});
  });

  hello();

  current = {
    leave: () => {
      offCourse();
      setPresenceSender(null);
      void room.leave();
    },
  };
}

export function leaveTogether() {
  attempt++;
  const going = current;
  current = null;
  if (!going) return;
  going.leave();
  clearPeers();
  useNetStore.getState().reset();
  useTogether.setState({ code: null, runners: [], best: null });
}
