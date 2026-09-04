"use client";

import { useEffect } from "react";
import { Joystick } from "ecctrl/input";
import {
  ThumbCluster,
  ThumbStack,
  TouchButton,
} from "@/components/hud/TouchButton";
import { HAPTIC, haptic } from "@/lib/player-settings";
import { touchInput } from "./touch-input";
import { useMoveMode } from "./move-mode";
import { requestRespawn } from "./play-actions";
import { useCourse } from "./course";

/**
 * On-screen controls for touch devices (SPEC §1 put mobile out of v1; this is
 * a deliberate addition on top).
 *
 * ── The layout ───────────────────────────────────────────────────────────
 *
 * Left thumb steers, right thumb acts, and neither ever crosses the middle.
 * The thumbstick is ecctrl's own overlay — worth keeping rather than
 * hand-rolling, because it already handles pointer capture, multi-touch
 * pointer-id tracking and radius clamping. Everything else is `TouchButton`,
 * which owns the 48px floor and the 8px spacing so that no cluster in the app
 * can drift away from them.
 *
 * ── Contextual, not maximal ──────────────────────────────────────────────
 *
 * The right cluster changes with what the player is actually doing. JUMP and
 * RUN are always there. RESTART appears only on a course, because a world with
 * no goal has no run to restart. FLY appears only where the player can edit,
 * because that is the only place it is a tool rather than a cheat. A phone
 * screen is small enough that a button which does nothing here is a button
 * that hid the world for no reason.
 *
 * Everything is `position: fixed` above the canvas, so a pointer that starts
 * on a control never reaches the canvas's drag-to-look listener. That is what
 * lets the left thumb drive while the right thumb looks.
 */
export function TouchControls({ canFly = false }: { canFly?: boolean }) {
  const running = useMoveMode((s) => s.running);
  // Sprint only — deliberately NOT the Shift lock-on. On a phone the whole
  // point is that the character turns to face wherever the stick is pushed;
  // pinning its facing to the camera would take that away.
  const toggleRun = useMoveMode((s) => s.toggleRun);
  const flying = useMoveMode((s) => s.flying);
  const toggleFly = useMoveMode((s) => s.toggleFly);

  // A course is a world with a goal; `startedAt` is set the moment one begins.
  const onCourse = useCourse((s) => s.worldId !== null);

  // Don't leave sprint, a lock-on or flight armed for the next world you open.
  useEffect(() => useMoveMode.getState().reset, []);

  // A held button when the tab goes away stays held forever: the pointerup
  // lands on a page that is no longer listening.
  useEffect(() => {
    const release = () => {
      touchInput.jump = false;
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") release();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", release);
      release();
    };
  }, []);

  return (
    <>
      <Joystick
        joystickMaxRadius={44}
        joystickWrapperStyle={{
          left: "calc(env(safe-area-inset-left, 0px) + var(--hud-inset, 0px) + 12px)",
          bottom:
            "calc(env(safe-area-inset-bottom, 0px) + var(--hud-inset, 0px) + 12px)",
          width: 168,
          height: 168,
        }}
        joystickBaseStyle={{
          width: 116,
          height: 116,
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "var(--glass-blur)",
        }}
        joystickKnobStyle={{
          width: 62,
          height: 62,
          background: "var(--color-ink)",
          boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
        }}
      />

      <ThumbCluster side="right">
        <ThumbStack>
          {/* The parkour cluster. One button, because the only thing a runner
              wants mid-course is another attempt — and it is placed away from
              JUMP on purpose, since a mis-hit here costs the whole run. */}
          {onCourse && (
            <TouchButton
              label="RETRY"
              size="sm"
              accent="var(--color-dim)"
              onPress={() => {
                haptic(HAPTIC.event);
                requestRespawn();
              }}
            />
          )}
          {canFly && (
            <TouchButton
              label="FLY"
              size="sm"
              mode="latch"
              active={flying}
              accent="var(--color-accent)"
              onPress={() => {
                haptic(HAPTIC.event);
                toggleFly();
              }}
            />
          )}
        </ThumbStack>

        <ThumbStack>
          {/* Latching — tap to arm sprint, then just steer. Holding a run
              button while also steering and looking is a three-thumb problem.
              In flight the same button descends, which is the pairing every
              creative mode uses. */}
          <TouchButton
            label={flying ? "DOWN" : "RUN"}
            size="md"
            mode={flying ? "hold" : "latch"}
            active={!flying && running}
            accent="var(--color-dim)"
            onPress={() => {
              if (flying) {
                useMoveMode.getState().setFlying(true);
                // Descent reads `running` in the flight loop, so holding this
                // is the same latch used momentarily.
                if (!useMoveMode.getState().running) toggleRun();
              } else {
                toggleRun();
              }
            }}
            onRelease={
              flying
                ? () => {
                    if (useMoveMode.getState().running) toggleRun();
                  }
                : undefined
            }
          />

          {/* Momentary — held, so the jump-feel layer still sees a real press
              and release edge and variable jump height keeps working. Double
              tap toggles flight where it is available; the Player owns that,
              because the same gesture has to work from the keyboard. */}
          <TouchButton
            label={flying ? "UP" : "JUMP"}
            size="lg"
            accent="var(--color-accent)"
            onPress={() => {
              touchInput.jump = true;
            }}
            onRelease={() => {
              touchInput.jump = false;
            }}
          />
        </ThumbStack>
      </ThumbCluster>
    </>
  );
}
