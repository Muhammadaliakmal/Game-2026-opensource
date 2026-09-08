/**
 * Four peers in one room, with a number attached.
 *
 * `plan-phase5.md` §5 has one acceptance row that has never been anything but
 * "Not measured": *4 peers at 60 fps, no snapping*. It stayed empty because it
 * reads as needing four humans at four keyboards. Half of it does — frame rate
 * is a property of a renderer on a device, and nothing headless can speak to
 * it, which is what `?perf=1` is for.
 *
 * The other half is not about frames. A peer snaps when its next transform
 * arrives later than `INTERP_DELAY` after the last one: `lib/net/peers.ts`
 * renders 120 ms in the past precisely so there are always two known samples to
 * walk between, and the moment a packet is later than that the renderer has
 * nothing to walk toward and must jump. That is a property of the network and
 * of the server's patch loop, it is measurable from Node, and — the reason this
 * is a script rather than a test — it is measurable against the *deployed*
 * server. The number that matters is the one Render produces on the free plan,
 * not the one localhost produces.
 *
 * ── How latency is recovered without a shared clock ──────────────────────
 *
 * Every bot walks along +X at exactly one unit per second from a common `t0`,
 * so `x` IS the send timestamp: an observer reads `t0 + x * 1000` and subtracts
 * it from the moment its callback fired. All bots share one process, so they
 * share one clock, and the difference is a true one-way send-to-receive time
 * with no skew to correct for. `x` is a float32 on the wire (see
 * `server/src/state.ts`), whose ulp at 100 seconds is about 0.01 ms — three
 * orders of magnitude finer than anything being measured here.
 *
 * It also solves a subtler problem. Colyseus only patches fields that changed,
 * so a bot standing still emits nothing at all, and a harness built on
 * stationary bots would measure an empty room and report it as perfect.
 *
 * Usage:
 *   npm run peers:soak
 *   npm run peers:soak -- --url wss://blockworld-rooms.onrender.com --seconds 60
 *   npm run peers:soak -- --token "<a real Clerk session token>"
 */
import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { INTERP_DELAY } from "@/lib/net/peers";
import { SEND_INTERVAL } from "@/lib/net/presence";

interface Args {
  url: string;
  world: string;
  peers: number;
  seconds: number;
  token: string;
  send: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    url: get("url", process.env.NEXT_PUBLIC_MULTIPLAYER_URL || "ws://localhost:2567"),
    // A built-in: generated rather than stored, so a soak run never touches
    // anybody's world and never writes a row. The sync route answers for it
    // without a database at all.
    world: get("world", "island"),
    peers: Number(get("peers", "4")),
    seconds: Number(get("seconds", "30")),
    token: get("token", ""),
    /**
     * How often a bot sends, in ms. Defaults to the game's own `SEND_INTERVAL`
     * and exists as a flag for one reason: the room patches on a 50 ms grid
     * (`patchRate` in BuildRoom), so a send interval that is not a multiple of
     * it does not arrive at the rate it was sent at. Being able to vary this
     * is what turns "arrivals are 100 ms apart, not 83" from a puzzle into a
     * measurement.
     */
    send: Number(get("send", String(SEND_INTERVAL))),
  };
}

/** One observed arrival: when it landed, and when it was sent. */
interface Arrival {
  at: number;
  sentAt: number;
}

const percentile = (sorted: number[], p: number): number =>
  sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const ms = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} ms` : "—");

interface PlayerLike {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(args.peers) || args.peers < 2) {
    throw new Error("--peers must be at least 2: one to move and one to watch it move");
  }

  console.log(
    `peer-soak: ${args.peers} peers on "${args.world}" via ${args.url} for ${args.seconds}s\n` +
      `sending every ${args.send} ms` +
      (args.send === SEND_INTERVAL
        ? " (the game's own SEND_INTERVAL)"
        : ` (the game itself sends every ${SEND_INTERVAL} ms)`) +
      `, budget ${INTERP_DELAY} ms (INTERP_DELAY, lib/net/peers.ts)\n`
  );

  const t0 = Date.now();
  const rooms: Room[] = [];
  const joinMs: number[] = [];

  for (let i = 0; i < args.peers; i++) {
    const client = new Client(args.url);
    if (args.token) client.auth.token = args.token;
    const startedAt = Date.now();
    const room = await client.joinOrCreate("build", {
      worldId: args.world,
      character: "courier",
    });
    joinMs.push(Date.now() - startedAt);
    rooms.push(room);
  }

  // Every bot landing in the SAME room is the thing being measured; four bots
  // in four rooms would produce a beautiful report about nothing.
  // `filterBy(["worldId"])` in server/src/index.ts is what makes it true, so it
  // is worth asserting rather than assuming.
  const roomIds = new Set(rooms.map((r) => r.roomId));
  if (roomIds.size !== 1) {
    throw new Error(
      `peers landed in ${roomIds.size} different rooms (${[...roomIds].join(", ")}) — ` +
        "filterBy(['worldId']) is not doing its job and nothing below would mean anything"
    );
  }

  // The first bot watches; all of them move, so the room carries the full peer
  // count rather than one fewer.
  const observer = rooms[0];
  const arrivals = new Map<string, Arrival[]>();

  const $ = getStateCallbacks(observer);
  $(observer.state).players.onAdd((player: PlayerLike, id: string) => {
    if (id === observer.sessionId) return;
    arrivals.set(id, []);
    // The same callback the game hangs its interpolator on — see
    // `connectToWorld` in lib/net/room.ts. Measuring anywhere else would be
    // measuring a path no player ever uses.
    $(player).onChange(() => {
      arrivals.get(id)?.push({ at: Date.now(), sentAt: t0 + player.x * 1000 });
    });
  });

  const timers = rooms.map((room) =>
    setInterval(() => {
      const elapsed = (Date.now() - t0) / 1000;
      room.send("move", {
        // x carries the clock; z and yaw move so the sample looks like a
        // walking player rather than a slider.
        x: elapsed,
        y: 0.5,
        z: Math.sin(elapsed) * 4,
        yaw: (elapsed % (Math.PI * 2)) - Math.PI,
        building: true,
      });
    }, args.send)
  );

  await new Promise((resolve) => setTimeout(resolve, args.seconds * 1000));
  timers.forEach(clearInterval);

  // Assemble the report before leaving: `leave()` tears down the state
  // callbacks, and a report gathered after that is a report about a
  // disconnected room.
  const gaps: number[] = [];
  const latencies: number[] = [];
  let samples = 0;
  for (const list of arrivals.values()) {
    for (let i = 0; i < list.length; i++) {
      samples++;
      latencies.push(list[i].at - list[i].sentAt);
      if (i > 0) gaps.push(list[i].at - list[i - 1].at);
    }
  }

  await Promise.all(rooms.map((room) => room.leave()));

  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const overBudget = gaps.filter((g) => g > INTERP_DELAY).length;
  const expected = Math.floor((args.seconds * 1000) / args.send) * (args.peers - 1);

  console.log(`room:      ${observer.roomId}`);
  console.log(`join:      ${joinMs.map((n) => `${n}ms`).join(", ")}`);
  console.log(
    `samples:   ${samples} from ${arrivals.size} peers ` +
      `(~${expected} expected; a shortfall is coalesced or dropped patches, not idle bots)\n`
  );

  console.log(`inter-arrival gap, as the interpolator sees it (budget ${INTERP_DELAY} ms)`);
  console.log(
    `  p50 ${ms(percentile(sortedGaps, 0.5))}   p95 ${ms(percentile(sortedGaps, 0.95))}` +
      `   p99 ${ms(percentile(sortedGaps, 0.99))}   max ${ms(sortedGaps[sortedGaps.length - 1])}`
  );
  console.log(
    `  over budget: ${overBudget} of ${gaps.length}` +
      (gaps.length ? ` (${((overBudget / gaps.length) * 100).toFixed(2)}%)` : "")
  );
  console.log(`\none-way presence latency (send -> another client's callback)`);
  console.log(
    `  p50 ${ms(percentile(sortedLat, 0.5))}   p95 ${ms(percentile(sortedLat, 0.95))}` +
      `   p99 ${ms(percentile(sortedLat, 0.99))}   max ${ms(sortedLat[sortedLat.length - 1])}`
  );

  // A p99 inside the budget is the pass: 99 samples in 100 arrive with road
  // left for the interpolator to walk. It does NOT say the client renders them
  // at 60 fps — that is the other half of the row, and it needs a device.
  const p99 = percentile(sortedGaps, 0.99);
  const ok = samples > 0 && p99 <= INTERP_DELAY;
  console.log(
    `\n${ok ? "PASS" : "FAIL"}: p99 gap ${ms(p99)} ${ok ? "within" : "OVER"} the ${INTERP_DELAY} ms ` +
      `budget — no snapping from the network at ${args.peers} peers.` +
      `\n      Frame rate is not measured here and cannot be: use ?perf=1 on a real device.`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
