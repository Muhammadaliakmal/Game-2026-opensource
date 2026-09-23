"use client";

import { useEffect, useRef, useState } from "react";
import { HAPTIC, haptic } from "@/lib/player-settings";
import { useHudOverlay } from "@/lib/hud-overlay";
import { useControlLayout, type ControlId } from "@/lib/control-layout";

/**
 * The one touch control every on-screen cluster is built from.
 *
 * ── The floor ────────────────────────────────────────────────────────────
 *
 * Apple HIG asks 44×44pt, Material 48×48dp, WCAG 2.5.5 AAA 44×44 CSS px. So
 * nothing here is smaller than 48, and the small variant is 48 exactly rather
 * than "48-ish": a control that is one pixel under the floor is a control that
 * fails an audit and, more to the point, a control someone's thumb misses.
 * Spacing is one unit of the same grid the whole interface is built on, because
 * targets that meet the size floor and then overlap are targets you still hit
 * the wrong one of.
 *
 * The floor survives the responsive pass unchanged. `--touch-sm` is 48px at
 * every breakpoint; what gets smaller on a small screen is the sizes ABOVE the
 * floor and the gaps between them. Shrinking a control below the floor to make
 * a layout fit trades an overlap bug for an accessibility one on the same
 * device, which is not a trade.
 *
 * ── Hold versus latch ────────────────────────────────────────────────────
 *
 * `hold` reports press and release, which is what a throttle, a jump and a
 * boost all need — variable jump height and a boost you can feather both
 * depend on seeing the release. `latch` toggles and stays, which is what
 * sprint needs: holding a run button while also steering and looking is a
 * three-thumb problem.
 *
 * ── Why the styling is inline ────────────────────────────────────────────
 *
 * These are `position: fixed` overlays outside the HUD grid, and they are the
 * only surfaces in the app that must keep working while a finger is dragging
 * across them — which means `touch-action: none` and pointer capture on the
 * element itself. The colours still come from the design tokens; only the
 * geometry is local.
 */

export type TouchButtonSize = "sm" | "md" | "lg";

/**
 * The three sizes, as tokens rather than numbers.
 *
 * They used to be the literals 48 / 64 / 84, which is what made the race
 * controls overlap on a phone: a constant cannot answer "how wide is the
 * screen", so the left and right clusters both asked for their full desktop
 * width and collided somewhere in the middle. The values now live in
 * tokens.css, where they are budgeted against the viewport at five
 * breakpoints — see the arithmetic in that file's "Touch control geometry"
 * block.
 *
 * CSS rather than a `useMediaQuery` hook on purpose: this is pure geometry
 * with no behaviour attached, so resizing a window or rotating a phone should
 * cost a style recalculation and not a React render of every live control.
 * (The one control that cannot be done this way is ecctrl's joystick, whose
 * drag radius is a number its own maths needs — hence `useTouchScale` in
 * lib/use-media-query, which is the same scale expressed for JavaScript.)
 */
const SIZE_VAR: Record<TouchButtonSize, string> = {
  /** The floor. Never smaller, at any breakpoint. */
  sm: "var(--touch-sm)",
  md: "var(--touch-md)",
  /** The primary action of a cluster — throttle, jump. */
  lg: "var(--touch-lg)",
};

export function TouchButton({
  label,
  size = "md",
  mode = "hold",
  active = false,
  disabled = false,
  armed = true,
  accent = "var(--color-accent)",
  square = false,
  control,
  className = "",
  style,
  onPress,
  onRelease,
}: {
  label: React.ReactNode;
  size?: TouchButtonSize;
  mode?: "hold" | "latch";
  /** Latch state, for a control whose "on" is owned by somebody else. */
  active?: boolean;
  disabled?: boolean;
  /**
   * Whether the thing behind this control can currently do anything.
   *
   * ── Why this is not `disabled` ───────────────────────────────────────
   *
   * `disabled` sets the DOM attribute, and a disabled button stops emitting
   * pointer events. A control that becomes disabled *while a finger is on it*
   * therefore never sees its own `pointerup` — so the input flag it set stays
   * true forever, and the next time it becomes armed the game acts as though
   * the button is held. Boost is exactly that case: it disarms mid-press, by
   * design, the instant the tank runs out.
   *
   * So `armed` is presentation only. The press and the release still fire, the
   * simulation still refuses the effect, and nothing can be stranded. The
   * distinction matters enough to have its own prop: `disabled` means "this
   * control does not apply right now", `armed` means "it applies and is empty".
   */
  armed?: boolean;
  accent?: string;
  /** Steering pads are wide rectangles, not discs. */
  square?: boolean;
  /**
   * Which customisable control this is, if it is one.
   *
   * Supplying it opts the button into the player's saved placement (see
   * lib/control-layout) and makes it draggable while the layout editor is
   * open. Omitting it leaves the button exactly where its cluster puts it —
   * which is right for anything that is chrome rather than a control.
   */
  control?: ControlId;
  className?: string;
  style?: React.CSSProperties;
  onPress(): void;
  onRelease?(): void;
}) {
  const [held, setHeld] = useState(false);
  const lit = active || held;

  // The layout editor. Subscribed to unconditionally — hooks cannot be
  // conditional — but `control` decides whether any of it is used.
  const laying = useHudOverlay((s) => s.laying);
  const layout = useControlLayout((s) => s.layout);
  const placement = (control && layout[control]) || null;
  const editing = laying && control !== undefined;

  /** Where the drag started, so movement is measured rather than absolute. */
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(
    null
  );

  // Real width and height rather than a transform scale: a transform would
  // leave the button's layout box at its old size, so a player who made JUMP
  // bigger would find it overlapping RUN while the gap between them still
  // measured 8px. Sizing for real keeps the cluster's spacing honest.
  //
  // A calc rather than a number, so the player's own multiplier composes with
  // the breakpoint's size instead of replacing it: the token answers "how big
  // is a large control on this screen" and the placement answers "how much
  // bigger than that does this player want it".
  const px = `calc(${SIZE_VAR[size]} * ${placement?.scale ?? 1})`;
  const offsetX = placement?.dx ?? 0;
  const offsetY = placement?.dy ?? 0;

  // A pointer lost to a cancel — a call arriving, the app backgrounding — must
  // release the control. A throttle stuck on because the phone rang is the
  // worst bug this file could have.
  const release = useRef(onRelease);
  useEffect(() => {
    release.current = onRelease;
  });
  useEffect(() => () => release.current?.(), []);

  return (
    <button
      aria-label={typeof label === "string" ? label : undefined}
      aria-pressed={mode === "latch" ? active : undefined}
      // `aria-disabled`, not `disabled` — see the prop's own note. It announces
      // the empty state without taking the element out of the event stream.
      aria-disabled={!armed || undefined}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);

        // While the layout editor is open a press MOVES the control instead of
        // firing it. Deliberately not "fires and also moves": a player nudging
        // JUMP into a comfortable spot must not be jumping the whole time they
        // do it, and there is no gesture that reads as one and not the other.
        if (editing && control) {
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            dx: offsetX,
            dy: offsetY,
          };
          haptic(HAPTIC.tap);
          return;
        }

        setHeld(true);
        haptic(HAPTIC.tap);
        onPress();
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start || !control) return;
        e.preventDefault();
        useControlLayout
          .getState()
          .place(
            control,
            start.dx + (e.clientX - start.x),
            start.dy + (e.clientY - start.y)
          );
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (drag.current) {
          drag.current = null;
          return;
        }
        setHeld(false);
        onRelease?.();
      }}
      onPointerCancel={() => {
        drag.current = null;
        setHeld(false);
        onRelease?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={className}
      style={{
        width: square ? undefined : px,
        height: px,
        minWidth: px,
        minHeight: px,
        borderRadius: square ? "var(--radius)" : "50%",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-game), sans-serif",
        fontSize: 12,
        // The game face has one weight; see the root layout.
        fontWeight: 400,
        letterSpacing: "0.06em",
        touchAction: "none",
        // Opted in here rather than by the caller. <ThumbCluster> is
        // pointer-events:none so its gaps stay transparent to the world
        // underneath, and every control inside it has to opt back in — which
        // is a rule that gets forgotten. It was: the race's steering pads sat
        // directly in the cluster with no <ThumbStack> around them, so they
        // computed pointer-events:none and a tap at their centre landed on
        // <html>. On the assisted scheme (the default) that read as a bike
        // that steers itself and ignores the rider, which is exactly what it
        // was. A control that cannot be pressed is not a control, so the
        // button now carries the opt-in itself and no placement can lose it.
        pointerEvents: "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        // Three states, not two. Disabled is the control being absent;
        // unarmed is the control being present and empty, which has to be
        // legible at a glance from the corner of the eye — a player should
        // never have to check the meter to know whether boost is ready.
        opacity: disabled ? 0.35 : armed ? 1 : 0.55,
        transition:
          "transform .1s var(--ease-ui), background .12s var(--ease-ui), box-shadow .12s var(--ease-ui)",
        // The saved offset and the press feedback compose here. Translate
        // first so the 0.93 press scale still happens about the button's own
        // centre wherever the player has moved it to.
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${held ? 0.93 : 1})`,
        // Unarmed desaturates the ring as well as dimming it, so the empty
        // state does not read as merely "a bit further away" — and crucially
        // it cannot fill, which is what the shipped button did and never
        // undid.
        border: `2px solid ${armed ? accent : "var(--color-edge)"}`,
        background: lit && armed ? accent : "var(--glass-bg)",
        color: lit && armed ? "var(--color-accent-ink)" : armed ? accent : "var(--color-dim)",
        boxShadow: editing
          ? `0 0 0 2px var(--color-accent), 0 0 22px -2px var(--color-accent)`
          : lit && armed
            ? `0 0 26px -4px ${accent}`
            : "none",
        // A control being arranged should look grabbable, and must not fight
        // the drag with a text-selection or scroll gesture.
        cursor: editing ? "grab" : undefined,
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

/**
 * A corner of the screen that belongs to one thumb.
 *
 * Fixed rather than part of the HUD grid, because these have to sit exactly
 * where the thumb rests regardless of what the HUD above them is doing — and
 * because a control inside a `pointer-events-none` grid would have to opt back
 * in one element at a time.
 *
 * The 8px gap and the safe-area inset are here rather than on each button so
 * that "the controls are 8px apart and clear of the notch" is one fact in one
 * place. `--hud-inset` is the player's own safe frame, mirrored onto the
 * document by `HudZones` precisely so that fixed clusters like this can read
 * it.
 */
export function ThumbCluster({
  side,
  children,
  className = "",
  style,
}: {
  side: "left" | "right";
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const blocked = useHudOverlay((s) => s.blocked);

  /*
   * Unmounted rather than hidden while a modal owns the screen.
   *
   * `display: none` would have been cheaper and is the wrong call: a button
   * held at the moment it is hidden never sees its own pointerup, and a
   * throttle or a jump latched on behind a settings panel is the worst class
   * of bug this file can have. Unmounting runs TouchButton's release-on-unmount
   * cleanup, which exists for exactly this — so the controls come back in a
   * neutral state rather than mid-press.
   */
  if (blocked) return null;

  return (
    <div
      className={className}
      style={{
        position: "fixed",
        zIndex: 10,
        bottom:
          "calc(env(safe-area-inset-bottom, 0px) + var(--hud-inset, 0px) + var(--touch-inset))",
        [side]:
          `calc(env(safe-area-inset-${side}, 0px) + var(--hud-inset, 0px) + var(--touch-inset))`,
        display: "flex",
        alignItems: "flex-end",
        gap: "var(--touch-gap)",
        /*
         * The budget, enforced rather than assumed.
         *
         * The sizes in tokens.css are chosen so the two clusters fit side by
         * side at every breakpoint, but that is arithmetic done in a comment,
         * and a comment does not hold when somebody adds a fourth button to a
         * cluster. This does: each side is capped at its share of the screen,
         * so a cluster that outgrows its budget wraps inside its own half
         * instead of silently sliding under the other thumb.
         *
         * The split is 44/56 rather than half and half because the two sides
         * are not symmetrical — the right carries the throttle, which is the
         * biggest control in the game and the one nothing may shrink into. It
         * sums to exactly 100vw, so even both sides at their cap cannot reach
         * across each other.
         *
         * 44/56 and not 46/54, which was the first split: at 320px that left
         * the right cluster's cap one pixel clear of its own content, so any
         * future change to a control would have started wrapping it with no
         * obvious cause. A guard that only just holds is a guard that is about
         * to stop holding.
         */
        maxWidth: `calc(${side === "left" ? "44vw" : "56vw"} - var(--touch-inset))`,
        flexWrap: "wrap",
        justifyContent: side === "left" ? "flex-start" : "flex-end",
        pointerEvents: "none",
        ...style,
      }}
    >
      {/* The gaps between controls stay transparent to the world underneath.
          Controls themselves opt back in: <ThumbStack> for a column of them,
          and <TouchButton> individually, so a button placed straight into a
          cluster is still pressable. */}
      {children}
    </div>
  );
}

/** A column inside a cluster. Bottom-aligned, so it grows away from the thumb. */
export function ThumbStack({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // The same token the cluster spaces its columns with, so the grid
        // between controls stays square as the breakpoint changes it.
        gap: "var(--touch-gap)",
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>
  );
}
