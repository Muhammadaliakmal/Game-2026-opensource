import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The service worker is evaluated, not just parsed.
 *
 * It shipped for two weeks throwing `ReferenceError: api is not defined`
 * on every load: markdown bold round a path in its header comment — two
 * asterisks then a slash — closed the comment early, the `api` that followed
 * became a live expression statement, and the
 * file still parsed — so `node --check`, the build and the deploy all
 * passed while no browser ever installed it. A worker that throws at
 * evaluation never registers and fails silently, since the page works
 * without it. So the test runs the script against a stub `self` and asks
 * for the three listeners a worker has to have.
 */

const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

function evaluate() {
  const listeners = new Set<string>();
  const self = {
    addEventListener: (type: string) => listeners.add(type),
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
    location: { origin: "https://example.test" },
  };
  const caches = { open: async () => ({ addAll: async () => undefined }), keys: async () => [] };
  // Evaluate as a classic script, the way the browser does, with the worker
  // globals it reaches for in scope.
  new Function("self", "caches", SOURCE)(self, caches);
  return listeners;
}

test("the service worker evaluates without throwing", () => {
  assert.doesNotThrow(evaluate);
});

test("it registers install, activate and fetch", () => {
  const listeners = evaluate();
  for (const type of ["install", "activate", "fetch"]) {
    assert.ok(listeners.has(type), `no ${type} listener`);
  }
});

test("its comment markers are balanced", () => {
  const opens = SOURCE.split("/*").length - 1;
  const closes = SOURCE.split("*/").length - 1;
  assert.equal(opens, closes);
});
