import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * `capacitor/www` is served to the WebView as-is, with no bundler, so a bare
 * module specifier (`import("@capacitor/…")`) can never resolve there. It
 * fails silently too: the shell's try/catch swallows it, and the one call it
 * guards is `SplashScreen.hide()` — with `launchAutoHide: false`, a splash
 * that covers the game forever. Plugins go through `window.Capacitor.Plugins`.
 */

const WWW = path.join(process.cwd(), "capacitor", "www");
const BARE = /\bimport\s*(?:\(\s*|[^;]*?\bfrom\s*)["'](?![./]|https?:)([^"']+)["']/g;

test("the Capacitor shell imports no bare module specifiers", () => {
  const pages = readdirSync(WWW).filter((f) => f.endsWith(".html"));
  assert.ok(pages.length > 0, "no pages found in capacitor/www");

  for (const page of pages) {
    const html = readFileSync(path.join(WWW, page), "utf8");
    const bare = [...html.matchAll(BARE)].map((m) => m[1]);
    assert.deepEqual(bare, [], `${page} imports ${bare.join(", ")}, which cannot resolve unbundled`);
  }
});

test("the pattern catches the shape that shipped", () => {
  const shipped = `const { SplashScreen } = await import("@capacitor/splash-screen");`;
  assert.equal([...shipped.matchAll(BARE)].length, 1);
  assert.equal([...`import x from "./local.js";`.matchAll(BARE)].length, 0);
});
