import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerError } from "colyseus";
import { GUEST_USER_ID, verifyJoin } from "./auth.ts";

/**
 * The policy, not the cryptography. Whether a Clerk token is genuine is
 * Clerk's problem and is tested by Clerk; what this file pins down is what
 * happens at each of the four combinations of "is a key configured" and "did
 * anyone present a token" — which is where a mistake ships a wide-open server.
 */
function withEnv(env: Record<string, string | undefined>, run: () => Promise<void>) {
  const keys = ["CLERK_SECRET_KEY", "ALLOW_ANONYMOUS_ROOMS", "CLERK_AUTHORIZED_PARTIES"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  return (async () => {
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
    try {
      await run();
    } finally {
      for (const k of keys) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    }
  })();
}

async function refusal(fn: () => Promise<unknown>): Promise<ServerError> {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof ServerError, `expected a ServerError, got ${e}`);
    return e;
  }
  throw new Error("expected the join to be refused");
}

test("an unconfigured server refuses everyone rather than trusting them", () =>
  withEnv({}, async () => {
    assert.equal((await refusal(() => verifyJoin(""))).code, 501);
    assert.equal((await refusal(() => verifyJoin("a.token"))).code, 501);
  }));

test("a token that does not verify is refused", () =>
  withEnv({ CLERK_SECRET_KEY: "sk_test_notreal" }, async () => {
    // Not a JWT at all, so this never leaves the process: no key fetch, no
    // network, just a refusal.
    assert.equal((await refusal(() => verifyJoin("obviously-not-a-jwt"))).code, 401);
  }));

test("no token on a configured server is a guest, not a rejection", () =>
  withEnv({ CLERK_SECRET_KEY: "sk_test_notreal" }, async () => {
    const identity = await verifyJoin("");
    assert.equal(identity.guest, true);
    assert.equal(identity.userId, GUEST_USER_ID);
  }));

test("a guest is never mistaken for the owner of an unowned world", () =>
  withEnv({ CLERK_SECRET_KEY: "sk_test_notreal" }, async () => {
    const identity = await verifyJoin("");
    // The built-in worlds report an empty owner through the unauthenticated
    // world source. A guest id of "" would compare equal to it.
    assert.notEqual(identity.userId, "");
  }));

test("ALLOW_ANONYMOUS_ROOMS opens the door, and only when set to 1", () =>
  withEnv({ ALLOW_ANONYMOUS_ROOMS: "1" }, async () => {
    const identity = await verifyJoin("");
    assert.equal(identity.guest, false, "local development needs to be able to build");
  }));

test("ALLOW_ANONYMOUS_ROOMS=0 is off, not merely present", () =>
  withEnv({ ALLOW_ANONYMOUS_ROOMS: "0" }, async () => {
    assert.equal((await refusal(() => verifyJoin(""))).code, 501);
  }));
