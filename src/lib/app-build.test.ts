import test from "node:test";
import assert from "node:assert/strict";
import { capacitorBuild } from "./app-mode";
import { ANDROID_APP_UA_TOKEN, LATEST_APP_BUILD } from "./capacitor-identity";

/**
 * The update notice is only as good as this parse. Wrong one way and every
 * up-to-date install is nagged forever; wrong the other and a stale one is
 * never told — and a sideloaded app has nothing else to tell it.
 */

const CHROME = "Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";

test("a browser is not the app", () => {
  assert.equal(capacitorBuild(CHROME), null);
});

test("an install from before the build token is build 1", () => {
  assert.equal(capacitorBuild(`${CHROME} ${ANDROID_APP_UA_TOKEN}`), 1);
});

test("the build token is read as the versionCode", () => {
  assert.equal(capacitorBuild(`${CHROME} ${ANDROID_APP_UA_TOKEN} SDGAppBuild/7`), 7);
});

test("the build token alone, without the app token, is not the app", () => {
  assert.equal(capacitorBuild(`${CHROME} SDGAppBuild/7`), null);
});

test("the published build is newer than the one that shipped without a token", () => {
  // Otherwise the 1.0.0 installs already out there would never be told.
  assert.ok(LATEST_APP_BUILD > 1);
});
