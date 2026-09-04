"use client";

import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePlayerSettings } from "@/lib/player-settings";

/**
 * The shared screen-zone grid every HUD renders through.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * HUD placement is genre-standardised, and the value of following the
 * convention is that a player is instantly at home. Before this, each HUD
 * hard-coded its own `absolute top-0 left-2` corners, which meant three
 * different paddings, three different safe-area stories, and no way to state
 * the convention anywhere except in prose. The zones are the convention,
 * written once:
 *
 *   top-left      minimap / track map · objective counter · tool indicator
 *   top-center     position + lap · split timer · mode banner · toasts
 *   top-right      currency · settings · pause · social
 *   center         countdown, flashes — things that own the screen briefly
 *   bottom-left    boost meter · stamina · palette anchor
 *   bottom-center  hotbar · context prompts
 *   bottom-right   speedometer · action cluster · place/delete
 *
 * ── The two things it actually does ──────────────────────────────────────
 *
 * 1. `data-mode` rebinds `--color-accent` for everything inside (see the
 *    `[data-mode]` rules in globals.css). That is the whole of the per-mode
 *    recolour — no component takes a mode prop, and `bg-accent` on a chip
 *    inside a race HUD is magenta with no code saying so. It is an attribute
 *    rather than an effect on <html>, so it is correct on the server and
 *    cannot flash the wrong colour on load.
 *
 * 2. It owns the insets. `viewportFit: "cover"` in the root layout lets the
 *    canvas paint under a phone's notch and rounded corners, which is right
 *    for the world and wrong for anything you need to read. Every zone is
 *    pushed inside `env(safe-area-inset-*)`, plus `--hud-inset` — a
 *    user-adjustable safe frame, which every console racer exposes because
 *    TV overscan and phone bezels are not something we can detect.
 *
 * Pointer events default to none so the world stays draggable through the
 * gaps between panels; each panel opts back in with `pointer-events-auto`.
 */

/**
 * The modes that own an accent. `arena` is listed because it is a screen with
 * a HUD, not because it has a colour of its own — it shares the race magenta
 * (see the `[data-mode]` rules in globals.css). Both are head-to-head
 * competitive modes, they are never on screen together, and a fourth neon
 * would buy nothing but a wider palette to keep coherent.
 */
export type HudMode = "build" | "race" | "parkour" | "arena";

export type Zone =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/**
 * Grid placement per zone, plus how the zone's own content stacks.
 *
 * Rows are `auto 1fr auto`: the top and bottom bands are exactly as tall as
 * what is in them, and the middle row absorbs everything left over, so a tall
 * bottom-left meter never pushes the top row off screen.
 *
 * A zone fills its cell rather than shrink-wrapping its panels, and the flex
 * alignment inside it does all the placing. That is worth stating because the
 * obvious alternative — `justify-self-start` and friends — looks identical
 * until a panel is wider than a third of the screen: a shrink-wrapped zone has
 * no width of its own, so `max-w-full` on a panel means nothing and the panel
 * silently overflows across its neighbour instead of scrolling inside itself.
 * Filling costs nothing, because the whole grid is `pointer-events-none` and
 * an empty zone cannot swallow a click on the world behind it.
 *
 * `items-*` is the cross axis, so in a column it is *horizontal*, and it
 * follows the zone's column rather than its row: panels stacked in a left
 * zone line up on their left edges, right zones on their right, centre zones
 * on their centres. Getting this from the row instead is the subtle version
 * of the bug — a narrow tool row under a wide palette hangs off the palette's
 * right edge and nothing looks obviously broken, it just never lines up.
 *
 * `center` is the exception that spans all three columns: a countdown, a
 * results panel or a course-complete card is centred on the *screen*, and
 * confining it to the middle third would cap a dialog at a third of the
 * width on the exact screens that have least to spare.
 */
const ZONE_CLASS: Record<Zone, string> = {
  "top-left": "col-start-1 row-start-1 items-start",
  "top-center": "col-start-2 row-start-1 items-center",
  "top-right": "col-start-3 row-start-1 items-end",
  center: "col-start-1 col-span-3 row-start-2 self-center items-center",
  "bottom-left": "col-start-1 row-start-3 items-start",
  "bottom-center": "col-start-2 row-start-3 items-center",
  "bottom-right": "col-start-3 row-start-3 items-end",
};

/** Bottom zones stack upward; top zones stack downward. */
const ZONE_STACK: Record<Zone, string> = {
  "top-left": "flex-col",
  "top-center": "flex-col",
  "top-right": "flex-col",
  center: "flex-col",
  "bottom-left": "flex-col justify-end",
  "bottom-center": "flex-col justify-end",
  "bottom-right": "flex-col justify-end",
};

/**
 * `--hud-inset` is the adjustable safe frame (Settings > Display); it defaults
 * to 0 and is ADDED to the platform's own safe-area inset rather than
 * replacing it, because a notch is not a preference.
 *
 * A CSS variable rather than four computed paddings so that anything else
 * wanting to respect the frame — the touch control clusters, which are
 * `position: fixed` and therefore outside this grid — can read the same value.
 */
const INSETS: CSSProperties = {
  paddingTop: "calc(env(safe-area-inset-top, 0px) + var(--hud-inset, 0px))",
  paddingRight: "calc(env(safe-area-inset-right, 0px) + var(--hud-inset, 0px))",
  paddingBottom:
    "calc(env(safe-area-inset-bottom, 0px) + var(--hud-inset, 0px))",
  paddingLeft: "calc(env(safe-area-inset-left, 0px) + var(--hud-inset, 0px))",
};

export function HudZones({
  mode,
  children,
  className = "",
}: {
  mode: HudMode;
  children: ReactNode;
  className?: string;
}) {
  const inset = usePlayerSettings((s) => s.hudInset);

  // Mirrored onto the document as well as set here. The touch clusters are
  // `position: fixed` and live outside this grid entirely, so the safe frame
  // has to exist at the document level for them to respect it — and a frame
  // that applies to the HUD but not to the controls under it is worse than
  // none, because it moves the two apart.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--hud-inset", `${inset}px`);
    return () => {
      root.style.removeProperty("--hud-inset");
    };
  }, [inset]);

  return (
    <div
      data-mode={mode}
      style={{ ...INSETS, "--hud-inset": `${inset}px` } as CSSProperties}
      className={`pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-[auto_1fr_auto] gap-2 p-2 sm:gap-3 sm:p-3 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * One zone. Renders nothing at all when empty — an empty flex box would still
 * take a row's worth of gap and shift the zone below it.
 */
export function HudZone({
  at,
  children,
  className = "",
}: {
  at: Zone;
  children?: ReactNode;
  className?: string;
}) {
  if (children === null || children === undefined || children === false) {
    return null;
  }
  return (
    <div
      className={`flex gap-2 ${ZONE_CLASS[at]} ${ZONE_STACK[at]} ${className}`}
    >
      {children}
    </div>
  );
}
