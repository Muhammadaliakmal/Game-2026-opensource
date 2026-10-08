import test from "node:test";
import assert from "node:assert/strict";
import { PartySession, type PartyMessage } from "./party-session";

/**
 * A whole party over an in-memory bus. With no server, every rule about who
 * hosts is something the browsers must agree on by themselves — and a
 * disagreement looks like two parties on one code, or a party nobody can
 * start. Neither throws.
 */

class Bus {
  sessions = new Map<string, PartySession>();
  links = new Set<string>();
  queue: { to: string; from: string; msg: PartyMessage }[] = [];
  private seed = 100;
  /** Each browser arrives a moment after the last. */
  clock = 1000;

  add(id: string, creator = false) {
    this.clock += 10;
    const s = new PartySession({
      selfId: id,
      code: "ABC234",
      creator,
      send: (msg, to) => {
        // A real send is serialised; a shared object would let one browser's
        // edit show up in another's view.
        const copy = JSON.parse(JSON.stringify(msg)) as PartyMessage;
        for (const peer of s.peers) if (!to || to === peer) this.queue.push({ to: peer, from: id, msg: copy });
      },
      onChange: () => {},
      now: () => this.clock,
      seed: () => ++this.seed,
      defer: (fn) => fn(),
    });
    this.sessions.set(id, s);
    for (const other of this.sessions.keys()) if (other !== id) this.connect(id, other);
    this.drain();
    return s;
  }

  connect(a: string, b: string) {
    this.links.add([a, b].sort().join("|"));
    this.sessions.get(a)!.peerJoined(b);
    this.sessions.get(b)!.peerJoined(a);
  }

  drop(id: string) {
    this.sessions.delete(id);
    for (const s of this.sessions.values()) s.peerLeft(id);
    this.drain();
  }

  drain() {
    for (let guard = 0; this.queue.length > 0; guard++) {
      assert.ok(guard < 10_000, "messages never settled");
      const { to, from, msg } = this.queue.shift()!;
      this.sessions.get(to)?.receive(msg, from);
    }
  }

  /** Everyone's view of who hosts and who is here. */
  views() {
    return [...this.sessions.values()].map((s) => ({
      host: s.view?.hostId,
      members: s.view?.members.map((m) => m.id).sort().join(","),
      phase: s.view?.phase,
      seed: s.view?.seed,
    }));
  }

  agree() {
    const v = this.views();
    for (const x of v) assert.deepEqual(x, v[0]);
    return v[0];
  }
}

test("the creator hosts, and everyone who connects is a member", () => {
  const bus = new Bus();
  bus.add("h", true);
  bus.add("g1");
  bus.add("g2");
  const v = bus.agree();
  assert.equal(v.host, "h");
  assert.equal(v.members, "g1,g2,h");
});

test("names are unique and are never typed", () => {
  const bus = new Bus();
  bus.add("h", true);
  for (let i = 0; i < 5; i++) bus.add(`g${i}`);
  const names = bus.sessions.get("h")!.view!.members.map((m) => m.name);
  assert.equal(new Set(names).size, names.length);
});

test("a guest's pick and start do nothing; the host's reach everyone", () => {
  const bus = new Bus();
  const h = bus.add("h", true);
  const g = bus.add("g");
  g.pick("chunk-runner");
  g.start();
  bus.drain();
  assert.equal(bus.agree().phase, "lobby");
  h.pick("chunk-runner");
  h.start();
  bus.drain();
  const v = bus.agree();
  assert.equal(v.phase, "playing");
  assert.ok(v.seed! > 0, "everyone has the round's seed");
});

test("a round: scores go to the host and come back to everyone", () => {
  const bus = new Bus();
  const h = bus.add("h", true);
  const g = bus.add("g");
  h.pick("tower-stack");
  h.start();
  bus.drain();
  g.score(12);
  bus.drain();
  assert.equal(h.view!.members.find((m) => m.id === "g")!.score, 12);
  h.done(30);
  g.done(40);
  bus.drain();
  assert.equal(bus.agree().phase, "results");
  const rows = g.view!.members.map((m) => [m.id, m.score, m.done]);
  assert.deepEqual(rows.sort(), [["g", 40, true], ["h", 30, true]]);
});

test("the host walking out hands the party to the longest-standing guest, mid-round", () => {
  const bus = new Bus();
  const h = bus.add("h", true);
  bus.add("g1");
  bus.add("g2");
  h.pick("chunk-runner");
  h.start();
  bus.drain();
  bus.sessions.get("g1")!.score(5);
  bus.drain();
  bus.drop("h");
  const v = bus.agree();
  assert.equal(v.host, "g1", "join order, not id order");
  assert.equal(v.members, "g1,g2");
  assert.equal(v.phase, "playing", "the round carries on");
  assert.equal(bus.sessions.get("g1")!.view!.members.find((m) => m.id === "g1")!.score, 5);
  // And the new host can finish it.
  bus.sessions.get("g1")!.done(5);
  bus.sessions.get("g2")!.done(9);
  bus.drain();
  assert.equal(bus.agree().phase, "results");
});

test("a guest arriving with nobody hosting waits rather than inventing a party", () => {
  const bus = new Bus();
  const g = bus.add("g");
  assert.equal(g.view, null);
  assert.equal(g.isHost, false);
});

test("two hosts on one code end as one party", () => {
  const bus = new Bus();
  // A party running, then a second creator on the same code — a host who
  // reloaded, or a link opened on another tab before it saw the first.
  bus.add("b", true);
  bus.add("x"); // b's guest
  bus.add("a", true);
  const v = bus.agree();
  assert.equal(v.host, "b", "the older party keeps its host, though 'a' sorts first");
  assert.equal(v.members, "a,b,x");
  assert.equal([...bus.sessions.values()].filter((s) => s.isHost).length, 1);
});

test("two hosts born at the same moment settle on the same one from both sides", () => {
  const bus = new Bus();
  bus.add("q", true);
  bus.clock -= 10;
  bus.add("p", true);
  const v = bus.agree();
  assert.equal(v.host, "p", "ties go to the smaller id");
  assert.equal([...bus.sessions.values()].filter((s) => s.isHost).length, 1);
});
