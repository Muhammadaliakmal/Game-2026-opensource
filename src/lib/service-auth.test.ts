import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_SECRET_HEADER, isRoomServer, secretMatches } from "./service-auth";

test("a matching secret is accepted", () => {
  assert.equal(secretMatches("hunter2", "hunter2"), true);
});

test("a wrong secret is refused, whatever its length", () => {
  assert.equal(secretMatches("hunter2", "hunter3"), false);
  assert.equal(secretMatches("short", "a-much-longer-secret"), false);
  assert.equal(secretMatches("a-much-longer-secret", "short"), false);
});

test("an absent secret is never a match", () => {
  // The case that matters: a deployment with no MULTIPLAYER_SECRET set must
  // end up with routes nobody can reach, not routes anybody can.
  assert.equal(secretMatches(null, undefined), false);
  assert.equal(secretMatches("anything", undefined), false);
  assert.equal(secretMatches("", ""), false);
  assert.equal(secretMatches(undefined, "the-real-secret"), false);
});

test("isRoomServer reads the header the room server actually sends", () => {
  const before = process.env.MULTIPLAYER_SECRET;
  process.env.MULTIPLAYER_SECRET = "shared";
  try {
    const withHeader = (value: string) =>
      new Request("https://example.test/api/worlds/x/sync", {
        headers: { [SERVICE_SECRET_HEADER]: value },
      });

    assert.equal(isRoomServer(withHeader("shared")), true);
    assert.equal(isRoomServer(withHeader("guessed")), false);
    assert.equal(isRoomServer(new Request("https://example.test/api/worlds/x/sync")), false);
  } finally {
    if (before === undefined) delete process.env.MULTIPLAYER_SECRET;
    else process.env.MULTIPLAYER_SECRET = before;
  }
});

test("an unset MULTIPLAYER_SECRET locks the route rather than opening it", () => {
  const before = process.env.MULTIPLAYER_SECRET;
  delete process.env.MULTIPLAYER_SECRET;
  try {
    const req = new Request("https://example.test/api/worlds/x/sync", {
      headers: { [SERVICE_SECRET_HEADER]: "" },
    });
    assert.equal(isRoomServer(req), false);
  } finally {
    if (before !== undefined) process.env.MULTIPLAYER_SECRET = before;
  }
});
