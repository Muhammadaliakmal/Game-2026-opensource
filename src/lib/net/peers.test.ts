import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERP_DELAY,
  addPeer,
  clearPeers,
  peerMap,
  pushSample,
  removePeer,
  samplePeer,
} from "./peers";

const at = (t: number, x = 0, y = 0, z = 0, yaw = 0) => ({ x, y, z, yaw, t });

test("a peer with one sample holds still rather than dividing by zero", () => {
  clearPeers();
  addPeer("a", "Ava", at(1000, 5, 2, 5));
  const m = samplePeer(peerMap().get("a")!, 1000 + INTERP_DELAY);

  assert.deepEqual([m.x, m.y, m.z], [5, 2, 5]);
  assert.equal(m.moveSpeed, 0);
  assert.equal(Number.isFinite(m.yaw), true);
});

test("a peer is drawn between its last two samples, one delay behind", () => {
  clearPeers();
  addPeer("a", "Ava", at(1000, 0, 0, 0));
  pushSample("a", at(2000, 10, 0, 0));
  const peer = peerMap().get("a")!;

  // Render time 1500 means a target of 1500 - delay, i.e. 38% along the way.
  const m = samplePeer(peer, 1500 + INTERP_DELAY);
  assert.equal(m.x, 5, "halfway between the two samples");

  // Before the segment starts and after it ends, clamp — never extrapolate
  // into a position nobody reported.
  assert.equal(samplePeer(peer, 500 + INTERP_DELAY).x, 0);
  assert.equal(samplePeer(peer, 9000 + INTERP_DELAY).x, 10);
});

test("speed is derived from the segment, so the gait matches the motion", () => {
  clearPeers();
  addPeer("a", "Ava", at(0, 0, 0, 0));
  pushSample("a", at(1000, 3, 0, 4)); // 5 units in one second

  const m = samplePeer(peerMap().get("a")!, 500 + INTERP_DELAY);
  assert.equal(m.moveSpeed, 5);
  assert.equal(m.isOnGround, true);
});

test("a fast climb or fall reads as airborne", () => {
  clearPeers();
  addPeer("a", "Ava", at(0, 0, 0, 0));
  pushSample("a", at(200, 0, 2, 0)); // 10 units/s upward

  const m = samplePeer(peerMap().get("a")!, 100 + INTERP_DELAY);
  assert.equal(m.isOnGround, false);
  assert.ok(m.verticalSpeed > 0, "rising, so the avatar throws its legs up");
});

test("yaw takes the shortest arc across the wrap", () => {
  clearPeers();
  const TWO_PI = Math.PI * 2;
  addPeer("a", "Ava", at(0, 0, 0, 0, TWO_PI - 0.2));
  pushSample("a", at(1000, 0, 0, 0, 0.2));

  // Halfway between 358.9° and 11.5° is the wrap point, not the 180° opposite
  // — a peer turning past north must not spin all the way around.
  const m = samplePeer(peerMap().get("a")!, 500 + INTERP_DELAY);
  const wrapped = ((m.yaw % TWO_PI) + TWO_PI) % TWO_PI;
  assert.ok(
    wrapped > TWO_PI - 0.05 || wrapped < 0.05,
    `expected the yaw to pass through 0, got ${wrapped}`
  );
});

test("an out-of-order packet does not become the segment", () => {
  clearPeers();
  addPeer("a", "Ava", at(1000, 0, 0, 0));
  pushSample("a", at(2000, 10, 0, 0));
  // A straggler that left the server before the one already applied. Letting
  // it become `to` would drag the avatar backwards.
  pushSample("a", at(1500, 99, 0, 0));

  const peer = peerMap().get("a")!;
  assert.equal(peer.to.t, 2000);
  assert.equal(peer.to.x, 10);
});

test("peers leave without a trace", () => {
  clearPeers();
  addPeer("a", "Ava", at(0));
  removePeer("a");
  assert.equal(peerMap().size, 0);
});
