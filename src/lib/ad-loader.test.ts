import { test } from "node:test";
import assert from "node:assert/strict";
import { AD_SCRIPT_SRC, adLoaderScript } from "./ad-loader";
import { ANDROID_APP_UA_TOKEN } from "./capacitor-identity";
import { ANDROID_PACKAGE_ID } from "./android";

/** Runs the inline loader against a fake browser; returns the scripts it added. */
function run(opts: { ua?: string; referrer?: string; session?: string | null; test?: boolean }) {
  const added: Array<Record<string, unknown>> = [];
  const document = {
    referrer: opts.referrer ?? "",
    createElement: () => {
      const el: Record<string, unknown> = {};
      el.setAttribute = (k: string, v: string) => (el[k] = v);
      return el;
    },
    head: { appendChild: (el: Record<string, unknown>) => added.push(el) },
  };
  const sessionStorage = { getItem: () => opts.session ?? null };
  const navigator = { userAgent: opts.ua ?? "Mozilla/5.0 Chrome/140" };
  new Function("navigator", "document", "sessionStorage", adLoaderScript(opts.test ?? false))(
    navigator,
    document,
    sessionStorage
  );
  return added;
}

test("a browser gets the AdSense script, async and anonymous", () => {
  const [s, ...rest] = run({});
  assert.equal(rest.length, 0);
  assert.equal(s.src, AD_SCRIPT_SRC);
  assert.equal(s.async, true);
  assert.equal(s.crossOrigin, "anonymous");
  assert.equal(s["data-adbreak-test"], undefined);
});

test("test ads are requested only when asked for", () => {
  assert.equal(run({ test: true })[0]["data-adbreak-test"], "on");
});

test("the Capacitor app never loads it", () => {
  assert.equal(run({ ua: `Mozilla/5.0 Chrome/140 ${ANDROID_APP_UA_TOKEN}` }).length, 0);
});

test("the TWA loads it, on launch and after a reload — it is Chrome, not a WebView", () => {
  assert.equal(run({ referrer: `android-app://${ANDROID_PACKAGE_ID}/` }).length, 1);
  assert.equal(run({ session: "1" }).length, 1);
});
