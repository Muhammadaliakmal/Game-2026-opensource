import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  THEME_COLOR,
  THEME_INIT_SCRIPT,
  THEME_KEY,
  parsePref,
  resolveTheme,
  type ThemePref,
} from "./theme";

/**
 * The init script is a string that restates `resolveTheme`, because it runs
 * before any bundle exists. This runs it against a fake page for every
 * stored value and both device settings, and requires it to agree with the
 * function it restates — including the theme-color it writes.
 */
function runScript(stored: string | null, systemDark: boolean, storageThrows = false) {
  const attrs: Record<string, string> = {};
  const meta: Record<string, string> = {};
  const g = {
    localStorage: {
      getItem: (k: string) => {
        if (storageThrows) throw new Error("blocked");
        return k === THEME_KEY ? stored : null;
      },
    },
    matchMedia: (q: string) => ({ matches: q.includes("dark") && systemDark }),
    document: {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
      querySelector: () => ({ setAttribute: (k: string, v: string) => (meta[k] = v) }),
    },
  };
  new Function("localStorage", "matchMedia", "document", THEME_INIT_SCRIPT)(
    g.localStorage,
    g.matchMedia,
    g.document
  );
  return { theme: attrs["data-theme"], color: meta.content };
}

test("the init script resolves every stored value the way resolveTheme does", () => {
  for (const stored of [null, "system", "light", "dark", "garbage"]) {
    for (const systemDark of [true, false]) {
      const want = resolveTheme(parsePref(stored), systemDark);
      const got = runScript(stored, systemDark);
      assert.equal(got.theme, want, `stored=${stored} systemDark=${systemDark}`);
      assert.equal(got.color, THEME_COLOR[want]);
    }
  }
});

test("blocked storage leaves the page untouched, which the CSS reads as dark", () => {
  assert.equal(runScript("light", false, true).theme, undefined);
});

test("parsePref only admits the three values", () => {
  const all: ThemePref[] = ["system", "light", "dark"];
  for (const p of all) assert.equal(parsePref(p === "system" ? null : p), p);
  assert.equal(parsePref("LIGHT"), "system");
});

test("the light tokens step aside for every game screen", () => {
  // A light override that reached a game would repaint the HUD over a night
  // sky. The scope is one selector, so it is checked as written.
  const css = readFileSync(join(process.cwd(), "src/app/tokens.css"), "utf8");
  assert.match(
    css,
    /:root\[data-theme="light"\]:not\(:has\(\[data-immersive\], \[data-dark\]\)\)\s*\{/
  );
  assert.equal(THEME_COLOR.light, css.match(/--color-base: (#[0-9a-f]{6});\s*\n\s*--color-surface: #ffffff/)?.[1]);
});
