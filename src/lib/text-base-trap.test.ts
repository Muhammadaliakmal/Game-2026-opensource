import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * `text-base` is a COLOUR in this codebase, and it is the page background.
 *
 * ── The bug this exists because of ───────────────────────────────────────
 *
 * `tokens.css` declares both `--text-base: 1.25rem` (a size on the type scale)
 * and `--color-base: #0a0a0f` (the page ground, the deepest surface). Tailwind
 * v4 generates a `text-<name>` utility for every `--color-*` token, so
 * `text-base` resolves to `color: var(--color-base)` — near-black — and the
 * font size it was written for is never applied.
 *
 * It fails silently and it fails invisibly. `className="text-base
 * font-semibold"` on a heading renders that heading in the page's own
 * background colour, so it is not faint or mis-sized: it is gone, on a dark
 * page, with the element still in the DOM at its full width taking up its
 * layout. Nothing in a type check, a lint run or a snapshot notices, and
 * neither does a person reading the diff.
 *
 * It had already shipped. Every course name on `/browse` — a page in the
 * header nav and the footer — plus four of its section headings were
 * unreadable in production, and so was "Made by players" on `/parkour`.
 *
 * ── Why a test and not a rename ──────────────────────────────────────────
 *
 * Renaming the token would fix it at the root and break every `bg-base`,
 * `border-base` and `text-base` already relying on the colour, including in
 * the HUD. The cheap half is this: an explicit text colour beside it, so the
 * class is unambiguous at the call site, and an assertion that says so when
 * somebody writes the next one from memory.
 */

const ROOT = join(process.cwd(), "src");

/** A colour utility that settles the question. */
const HAS_COLOUR = /\btext-(ink|dim|accent|white|black|\[)/;

function* tsxFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* tsxFiles(path);
    else if (extname(path) === ".tsx") yield path;
  }
}

test("no className uses text-base without stating a text colour", () => {
  const offenders: string[] = [];

  for (const file of tsxFiles(ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/className="([^"]*)"/g)) {
      const classes = match[1];
      if (!/\btext-base\b/.test(classes)) continue;
      if (HAS_COLOUR.test(classes)) continue;
      offenders.push(
        `${file.replace(ROOT, "src")}: "${classes}"\n` +
          `    -> text-base is var(--color-base), the page background. Add text-ink.`
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `text-base without an explicit colour renders invisible:\n  ${offenders.join(
      "\n  "
    )}`
  );
});
