"use client";

import { useEffect, useRef, useState } from "react";
import { HAPTIC, haptic } from "@/lib/player-settings";

/**
 * The one touch control every on-screen cluster is built from.
 *
 * ── The floor ────────────────────────────────────────────────────────────
 *
 * Apple HIG asks 44×44pt, Material 48×48dp, WCAG 2.5.5 AAA 44×44 CSS px. So
 * nothing here is smaller than 48, and the small variant is 48 exactly rather
 * than "48-ish": a control that is one pixel under the floor is a control that
 * fails an audit and, more to the point, a control someone's thumb misses.
 * Spacing is 8px, the same unit the whole interface is built on, because
 * targets that meet the size floor and then overlap are targets you still hit
 * the wrong one of.
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

const SIZES: Record<TouchButtonSize, number> = {
  /** The floor. Never smaller. */
  sm: 48,
  md: 64,
  /** The primary action of a cluster — throttle, jump. */
  lg: 84,
};

export function TouchButton({
  label,
  size = "md",
  mode = "hold",
  active = false,
  disabled = false,
  accent = "var(--color-accent)",
  square = false,
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
  accent?: string;
  /** Steering pads are wide rectangles, not discs. */
  square?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onPress(): void;
  onRelease?(): void;
}) {
  const [held, setHeld] = useState(false);
  const lit = active || held;
  const px = SIZES[size];

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
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(true);
        haptic(HAPTIC.tap);
        onPress();
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setHeld(false);
        onRelease?.();
      }}
      onPointerCancel={() => {
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
        fontFamily: "var(--font-orbitron), sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        opacity: disabled ? 0.35 : 1,
        transition:
          "transform .1s var(--ease-ui), background .12s var(--ease-ui), box-shadow .12s var(--ease-ui)",
        transform: held ? "scale(0.93)" : "scale(1)",
        border: `2px solid ${accent}`,
        background: lit ? accent : "var(--glass-bg)",
        color: lit ? "var(--color-accent-ink)" : accent,
        boxShadow: lit ? `0 0 26px -4px ${accent}` : "none",
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
  return (
    <div
      className={className}
      style={{
        position: "fixed",
        zIndex: 10,
        bottom:
          "calc(env(safe-area-inset-bottom, 0px) + var(--hud-inset, 0px) + 16px)",
        [side]:
          `calc(env(safe-area-inset-${side}, 0px) + var(--hud-inset, 0px) + 16px)`,
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        pointerEvents: "none",
        ...style,
      }}
    >
      {/* Children opt back in individually, so the gaps between controls stay
          transparent to the world underneath. */}
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
        gap: 8,
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>
  );
}
