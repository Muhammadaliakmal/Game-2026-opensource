import test from "node:test";
import assert from "node:assert/strict";
import { networkPrefix, publicAddress } from "./nearby";

/**
 * "Nearby" is one equality on a hash, so it fails silently both ways: two
 * devices on one Wi-Fi that hash apart see nothing, and two networks that hash
 * together see each other's parties.
 */

test("one IPv4 router is one network", () => {
  assert.equal(networkPrefix("203.0.113.7"), "203.0.113.7");
  assert.notEqual(networkPrefix("203.0.113.7"), networkPrefix("203.0.113.8"));
});

test("an IPv4-mapped v6 address is the v4 address", () => {
  assert.equal(networkPrefix("::ffff:203.0.113.7"), "203.0.113.7");
});

test("devices on one IPv6 LAN share a /64", () => {
  const phone = "2001:db8:abcd:12:a1b2:c3ff:fe00:1";
  const laptop = "2001:0db8:abcd:0012:9f00::42";
  assert.equal(networkPrefix(phone), networkPrefix(laptop));
  assert.notEqual(networkPrefix(phone), networkPrefix("2001:db8:abcd:13::1"));
});

test("a compressed v6 prefix expands before it is cut", () => {
  assert.equal(networkPrefix("2001:db8::1"), "2001:db8:0:0");
});

test("the public address is the srflx candidate, v4 preferred", () => {
  const lines = [
    "candidate:1 1 udp 2122260223 9f2c-uuid.local 54321 typ host generation 0",
    "candidate:2 1 udp 1686052607 2001:db8::5 40000 typ srflx raddr 0.0.0.0 rport 0",
    "candidate:3 1 udp 1686052607 198.51.100.4 40001 typ srflx raddr 0.0.0.0 rport 0",
  ];
  assert.equal(publicAddress(lines), "198.51.100.4");
  assert.equal(publicAddress(lines.slice(0, 2)), "2001:db8::5");
  assert.equal(publicAddress(lines.slice(0, 1)), null, "a LAN-only candidate is not a public address");
});
