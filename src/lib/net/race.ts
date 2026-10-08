"use client";

import { relayConfig } from "./relays";
import type { WorldDoc } from "@/lib/worlddoc";
import { useRaceStore, type RacePhase, type RiderView } from "@/stores/race-store";
import { useNetStore } from "@/stores/net-store";
import { addPeer, clearPeers, pushSample, removePeer } from "./peers";
import { setPresenceSender } from "./presence";
import { RACE, Race } from "@/lib/race-rules";
import { GRID_YAW, MAX_RIDERS, raceTrackSlug } from "@/lib/race-track";
import { cpuName, createCpuRider, heightMap, type CpuDifficulty, type CpuRider } from "@/lib/race-cpu";
import { guestName } from "@/lib/party-games";
import { mulberry32 } from "@/arcade/host/rng";

/**
 * A race, with no server: the riders' browsers connect to each other.
 *
 * The rider who opened the race is its HOST. Their tab runs the race rules
 * (`race-rules.ts` — the same class the room server ran), the CPU riders
 * (`race-cpu.ts`) and the clock, and sends everyone the state fifteen times a
 * second. Everyone else sends the host their bike's position and draws what
 * comes back. Trystero carries the introduction over public relays, encrypted
 * with the race code, exactly as a party's is (`net/party.ts`); after that it
 * is browser to browser, which on one Wi-Fi is a hop across the router.
 *
 * The track is never sent. Every track is a generator in this build, so each
 * rider builds it from its id — the host says which.
 *
 * The exports are the ones the room-server version had, so the bike, the HUD
 * and the canvas did not change.
 */

const APP_ID = "specdrivengames.com/race";
/** How often the host sends the race. 15 Hz sits inside `peers.ts`'s 120 ms interpolation window. */
const STATE_MS = 66;
/** The host's clock: CPU steps and the race rules. */
const TICK_MS = 33;
/** How often rider state is allowed to reach React. See the HUD's note in the old version: a board read by eye. */
const HUD_SYNC_MS = 140;
/** How long a guest waits to hear from a host. */
const NO_HOST_MS = 15_000;

/** Where this bike should sit when the grid forms. */
export interface GridPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

type GridListener = (pose: GridPose) => void;
let onGrid: GridListener | null = null;

/** The bike registers here to be told where to line up. A push, because placing a rigid body is a frame-loop job. */
export function setGridListener(fn: GridListener | null) {
  onGrid = fn;
}

export interface JoinRaceOptions {
  /** This browser opened the race and runs it. */
  host: boolean;
  /** Riders the grid waits for before the lights arm (host only). */
  target?: number;
  /** A `RACE_TRACKS` id (host only). */
  track?: string;
  /** CPU riders' difficulty, or none (host only). */
  cpu?: CpuDifficulty;
  /**
   * CPU riders to put on the grid at once — a race against the CPU. Absent
   * with `cpu` set means "fill the empty slots with CPUs when the lights arm",
   * so friends can still join first.
   */
  bots?: number;
}

interface WireRider {
  id: string;
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

type HostMsg =
  | { t: "s"; track: string; phase: RacePhase; laps: number; countdownMs: number; target: number; riders: WireRider[] }
  | { t: "grid"; poses: Record<string, GridPose> }
  | { t: "full" };

type GuestMsg =
  | { t: "m"; x: number; y: number; z: number; yaw: number }
  | { t: "c"; k: "start" | "rematch" }
  | { t: "c"; k: "target"; n: number };

type Sender = (data: unknown, opts?: { target?: string }) => Promise<void>;

interface Session {
  leave(): void;
  start(): void;
  rematch(): void;
  target(n: number): void;
}

let session: Session | null = null;
let attempt = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build the track this race runs on, from its id. Lazy: the generators are not small. */
async function trackDoc(track: string): Promise<WorldDoc | null> {
  const { buildBuiltInDoc } = await import("@/lib/built-in-worlds");
  return buildBuiltInDoc(raceTrackSlug(track), "race");
}

/** Mirror a state into the HUD and the peer map. */
function makeMirror(selfId: string) {
  const known = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: HostMsg & { t: "s" } = { t: "s", track: "", phase: "waiting", laps: RACE.laps, countdownMs: 0, target: 2, riders: [] };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const riders: RiderView[] = pending.riders.map((r) => ({
      id: r.id,
      name: r.name,
      lap: r.lap,
      progress: r.progress,
      place: r.place,
      timeMs: r.timeMs,
    }));
    useRaceStore.getState().setRace({
      phase: pending.phase,
      laps: pending.laps,
      countdownMs: pending.countdownMs,
      target: pending.target,
      riders,
    });
  };

  return {
    apply(s: HostMsg & { t: "s" }) {
      const now = Date.now();
      const here = new Set<string>();
      for (const r of s.riders) {
        here.add(r.id);
        if (r.id === selfId) continue;
        const sample = { x: r.x, y: r.y, z: r.z, yaw: r.yaw, t: now };
        if (!known.has(r.id)) {
          known.add(r.id);
          addPeer(r.id, r.name, sample, false);
          useNetStore.getState().addPeerId(r.id);
        } else pushSample(r.id, sample, false);
      }
      for (const id of known) {
        if (!here.has(id)) {
          known.delete(id);
          removePeer(id);
          useNetStore.getState().removePeerId(id);
        }
      }
      const phaseChanged = s.phase !== pending.phase || s.phase !== useRaceStore.getState().phase;
      pending = s;
      // A phase change jumps the queue: the lights and the results must never be late.
      if (phaseChanged) flush();
      else if (!timer) timer = setTimeout(flush, HUD_SYNC_MS);
    },
    stop() {
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Join (or, as host, open) the race with this code. Resolves to a disposer.
 */
export async function joinRace(
  code: string,
  onWorld: (doc: WorldDoc) => void,
  opts: JoinRaceOptions
): Promise<() => void> {
  leaveRace();
  const mine = ++attempt;
  const store = useRaceStore.getState();
  store.reset();
  store.setConnection({ connected: false, code, error: null });

  let mod: typeof import("trystero");
  try {
    mod = await import("trystero");
  } catch {
    if (mine === attempt) store.setConnection({ connected: false, error: "Could not load the race. Check your connection." });
    return () => {};
  }
  if (mine !== attempt) return () => {};

  const room = mod.joinRoom({ appId: APP_ID, password: code, relayConfig }, `race-${code}`);
  const action = room.makeAction("r");
  const send = action.send as unknown as Sender;
  const selfId = mod.selfId;
  const mirror = makeMirror(selfId);
  const timers: ReturnType<typeof setInterval>[] = [];
  let left = false;

  const stop = () => {
    if (left) return;
    left = true;
    for (const t of timers) clearInterval(t);
    mirror.stop();
    setPresenceSender(null);
    void room.leave();
  };

  if (opts.host) {
    hostRace({ code, opts, selfId, send, onWorld, mirror, timers, room, action });
  } else {
    guestRace({ code, selfId, send, onWorld, mirror, timers, room, action });
  }

  session = {
    leave: stop,
    start: () => (opts.host ? hostCommand?.("start") : void send({ t: "c", k: "start" } satisfies GuestMsg)),
    rematch: () => (opts.host ? hostCommand?.("rematch") : void send({ t: "c", k: "rematch" } satisfies GuestMsg)),
    target: (n) => (opts.host ? hostCommand?.("target", n) : void send({ t: "c", k: "target", n } satisfies GuestMsg)),
  };
  return leaveRace;
}

/** The host's command handler, reachable by the session. One race at a time. */
let hostCommand: ((k: "start" | "rematch" | "target", n?: number) => void) | null = null;

type RoomLike = import("trystero").Room;
type ActionLike = { onMessage: ((data: never, ctx: { peerId: string }) => void) | null };

function hostRace(c: {
  code: string;
  opts: JoinRaceOptions;
  selfId: string;
  send: Sender;
  onWorld: (doc: WorldDoc) => void;
  mirror: ReturnType<typeof makeMirror>;
  timers: ReturnType<typeof setInterval>[];
  room: RoomLike;
  action: ActionLike;
}) {
  const { opts, selfId, send } = c;
  const track = raceTrackSlug(opts.track);
  const race = new Race();
  const rng = mulberry32(Array.from(c.code).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
  const cpus = new Map<string, CpuRider>();
  let heightAt: ReturnType<typeof heightMap> | undefined;
  let names = 0;
  let cpuCount = 0;
  const nameBase = rng() * 100;

  const humans = () => [...race.riders.keys()].filter((id) => !cpus.has(id)).length;

  const gridPoses = (): Record<string, GridPose> => {
    const out: Record<string, GridPose> = {};
    for (const [id, r] of race.riders) out[id] = { x: r.x, y: r.y, z: r.z, yaw: GRID_YAW };
    return out;
  };

  const sendGrid = () => {
    const poses = gridPoses();
    void send({ t: "grid", poses } satisfies HostMsg).catch(() => {});
    const mine = poses[selfId];
    if (mine) onGrid?.(mine);
    for (const [id, cpu] of cpus) {
      const r = race.riders.get(id);
      if (r) cpu.place(r);
    }
  };

  const addCpu = () => {
    if (!opts.cpu || race.full) return false;
    const id = `cpu-${cpuCount}`;
    const r = race.join(id, cpuName(cpuCount, opts.cpu), Date.now());
    cpuCount++;
    if (!r) return false;
    const cpu = createCpuRider(opts.cpu, rng, heightAt);
    cpu.place(r);
    cpus.set(id, cpu);
    return true;
  };

  /** Fill the grid's empty slots with CPUs, if this race has any. */
  const fillCpus = () => {
    if (!opts.cpu || opts.bots !== undefined) return;
    while (!race.full && addCpu()) {
      /* until the grid is full */
    }
  };

  const state = (): HostMsg => ({
    t: "s",
    track,
    phase: race.phase,
    laps: RACE.laps,
    countdownMs: race.phase === "countdown" ? Math.max(0, race.startsAt - Date.now()) : 0,
    target: race.target,
    riders: [...race.riders.values()].map((r) => ({
      id: r.id,
      name: r.name,
      x: r2(r.x),
      y: r2(r.y),
      z: r2(r.z),
      yaw: r2(r.yaw),
      lap: r.lap,
      progress: r2(r.progress * 1000) / 1000,
      place: r.place,
      timeMs: r.timeMs,
    })),
  });

  const broadcast = () => {
    const s = state();
    void send(s).catch(() => {});
    c.mirror.apply(s as HostMsg & { t: "s" });
  };

  /** Arming the lights, by whichever route, fills the empty slots first. */
  const arm = (now: number) => {
    if (race.phase !== "waiting") return;
    fillCpus();
    if (race.phase === "waiting") race.arm(now);
    sendGrid();
  };

  hostCommand = (k, n) => {
    const now = Date.now();
    if (k === "start") arm(now);
    else if (k === "rematch") {
      race.rematch(now);
      sendGrid();
    } else if (k === "target" && typeof n === "number") {
      // The grid counts people; CPUs fill around them when the lights arm.
      if (race.setTarget(n + cpus.size, now)) sendGrid();
    }
    broadcast();
  };

  void trackDoc(track).then((doc) => {
    if (!doc) {
      useRaceStore.getState().setConnection({ connected: false, error: "That track is not in this build." });
      return;
    }
    heightAt = heightMap(doc.parts);
    c.onWorld(doc);

    const now = Date.now();
    // Against the CPU: put them on the grid now and go as soon as the grid is
    // full. With friends: the grid waits for people, as it always has.
    const bots = Math.max(0, Math.min(MAX_RIDERS - 1, opts.bots ?? 0));
    race.setTarget(opts.cpu && opts.bots !== undefined ? 1 + bots : Math.max(1, opts.target ?? RACE.minAutoStart), now);
    race.join(selfId, guestName(nameBase + names++), now);
    for (let i = 0; i < bots; i++) addCpu();
    if (opts.cpu && opts.bots !== undefined && race.phase === "waiting") race.arm(now);
    useRaceStore.getState().setConnection({ connected: true, code: c.code, selfId, error: null });
    sendGrid();
    broadcast();

    setPresenceSender((x, y, z, yaw) => {
      const before = race.phase;
      race.move(selfId, { x, y, z, yaw }, Date.now());
      if (race.phase !== before) broadcast();
    });

    let last = performance.now();
    let sentAt = 0;
    c.timers.push(
      setInterval(() => {
        const t = performance.now();
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        const now2 = Date.now();
        const before = race.phase;
        race.tick(now2);
        const racing = race.phase === "racing";
        for (const [id, cpu] of cpus) race.move(id, cpu.step(dt, racing), now2);
        if (race.phase === "countdown" && before === "waiting") sendGrid();
        if (race.phase !== before || t - sentAt >= STATE_MS) {
          sentAt = t;
          broadcast();
        }
      }, TICK_MS)
    );
  });

  c.room.onPeerJoin = (id) => {
    const now = Date.now();
    const before = race.phase;
    const r = race.join(id, guestName(nameBase + names++), now);
    if (!r) {
      void send({ t: "full" } satisfies HostMsg, { target: id }).catch(() => {});
      return;
    }
    // A join that filled the grid armed the lights: fill CPUs around it.
    if (before === "waiting" && race.phase === "countdown") fillCpus();
    if (humans() > 0) sendGrid();
    broadcast();
  };

  c.room.onPeerLeave = (id) => {
    race.leave(id);
    broadcast();
  };

  c.action.onMessage = ((data: GuestMsg, ctx: { peerId: string }) => {
    if (!data || typeof data !== "object") return;
    if (data.t === "m") {
      const { x, y, z, yaw } = data;
      if (![x, y, z, yaw].every(Number.isFinite)) return;
      const before = race.phase;
      race.move(ctx.peerId, { x, y, z, yaw }, Date.now());
      if (race.phase !== before) broadcast();
    } else if (data.t === "c" && race.riders.has(ctx.peerId)) {
      hostCommand?.(data.k, data.k === "target" ? data.n : undefined);
    }
  }) as ActionLike["onMessage"];
}

function guestRace(c: {
  code: string;
  selfId: string;
  send: Sender;
  onWorld: (doc: WorldDoc) => void;
  mirror: ReturnType<typeof makeMirror>;
  timers: ReturnType<typeof setInterval>[];
  room: RoomLike;
  action: ActionLike;
}) {
  let hostId: string | null = null;
  let built = false;
  let lastGrid: GridPose | null = null;

  c.timers.push(
    setInterval(() => {
      if (!hostId) {
        useRaceStore.getState().setConnection({
          connected: false,
          error: "Nobody is hosting this race. Open a new one from the Race page.",
        });
      }
    }, NO_HOST_MS)
  );

  setPresenceSender((x, y, z, yaw) => {
    if (hostId) void c.send({ t: "m", x: r2(x), y: r2(y), z: r2(z), yaw: r2(yaw) } satisfies GuestMsg, { target: hostId }).catch(() => {});
  });

  c.room.onPeerLeave = (id) => {
    if (id !== hostId) return;
    useRaceStore.getState().setConnection({ connected: false, error: "The host left the race. Open a new one from the Race page." });
  };

  c.action.onMessage = ((data: HostMsg, ctx: { peerId: string }) => {
    if (!data || typeof data !== "object") return;
    if (data.t === "full") {
      useRaceStore.getState().setConnection({ connected: false, error: `That race already has ${MAX_RIDERS} riders.` });
      return;
    }
    if (data.t === "grid") {
      hostId ??= ctx.peerId;
      const mine = data.poses[c.selfId];
      if (mine) {
        lastGrid = mine;
        if (built) onGrid?.(mine);
      }
      return;
    }
    if (data.t === "s") {
      // The host is whoever sends the race. Only one browser does.
      hostId ??= ctx.peerId;
      if (ctx.peerId !== hostId) return;
      if (!built) {
        built = true;
        void trackDoc(data.track).then((doc) => {
          if (!doc) {
            useRaceStore.getState().setConnection({ connected: false, error: "That track is not in this build." });
            return;
          }
          c.onWorld(doc);
          useRaceStore.getState().setConnection({ connected: true, code: c.code, selfId: c.selfId, error: null });
          if (lastGrid) onGrid?.(lastGrid);
        });
      }
      c.mirror.apply(data);
    }
  }) as ActionLike["onMessage"];
}

export function leaveRace() {
  attempt++;
  const going = session;
  session = null;
  hostCommand = null;
  going?.leave();
  setGridListener(null);
  clearPeers();
  useNetStore.getState().reset();
  useRaceStore.getState().reset();
}

/** Start the lights early — which is also how one person runs a time trial. */
export function requestStart() {
  session?.start();
}

export function requestRaceRematch() {
  session?.rematch();
}

/** Change how many riders the grid waits for. */
export function requestGridSize(target: number) {
  session?.target(target);
}
