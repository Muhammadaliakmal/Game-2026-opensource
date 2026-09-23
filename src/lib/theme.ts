/**
 * Light, dark, or whatever the device says.
 *
 * ── What the theme reaches, and what it does not ─────────────────────────
 *
 * The site's pages and menus. Never a game: every game screen mounts an
 * `ImmersiveMarker`, and the light tokens in tokens.css are scoped to
 * `:root:not(:has([data-immersive]))`, so a world, a race or a cabinet is
 * dark whatever this says. That is not a gap. The sky, the block palette and
 * the neon HUD were all authored against a dark ground (see "The sky" in
 * CLAUDE.md), and a light HUD over a night circuit would be white panels on
 * a black world.
 *
 * ── No flash ─────────────────────────────────────────────────────────────
 *
 * The page is server-rendered and cached, so the server cannot know the
 * choice. `THEME_INIT_SCRIPT` runs in <head> before the first paint and sets
 * `data-theme` on <html>; everything after that is CSS. React never renders
 * the attribute, so hydration has nothing to disagree with — the
 * `suppressHydrationWarning` on <html> is for the attribute the script wrote.
 *
 * The script is a string, and it restates `THEME_KEY` and `resolveTheme`
 * rather than importing them, because it runs before any bundle has loaded.
 * `theme.test.ts` executes it and holds the two together.
 */

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "sdg_theme";
export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];

/** The browser chrome colour per theme — `<meta name="theme-color">`. */
export const THEME_COLOR: Record<Theme, string> = { dark: "#0a0a0f", light: "#f3f5fa" };

export function parsePref(raw: string | null): ThemePref {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/*
  Kept tiny and defensive: it runs on every page load before anything else,
  and a throw here (storage blocked in a private window) must leave the page
  dark rather than broken — dark is what the CSS says with no attribute.
*/
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_KEY
)});if(p!=="light"&&p!=="dark")p="system";var t=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(
  THEME_COLOR.dark
)}:${JSON.stringify(THEME_COLOR.light)});}catch(e){}})();`;

/* ── The live preference, for Settings ───────────────────────────────── */

const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(pref: ThemePref) {
  const t = resolveTheme(pref, systemDark());
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* Applies for this page either way. */
  }
  apply(pref);
  for (const l of listeners) l();
}

/**
 * For `useSyncExternalStore`. Also re-applies when the device flips between
 * light and dark while "system" is chosen — the one change nobody pressed.
 */
export function subscribeThemePref(onChange: () => void): () => void {
  listeners.add(onChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPref() === "system") apply("system");
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onSystem);
  };
}

export const getThemePref = readPref;
