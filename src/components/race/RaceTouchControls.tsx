"use client";

import { useEffect, useRef, useState } from "react";
import { Joystick } from "ecctrl/input";
import {
  ThumbCluster,
  ThumbStack,
  TouchButton,
} from "@/components/hud/TouchButton";
import { usePlayerSettings, type RaceScheme } from "@/lib/player-settings";
import { raceTouch, releaseRaceTouch } from "./race-touch";

/**
 * Thumb controls for riding, in four schemes.
 *
 * ── Why four and not one ─────────────────────────────────────────────────
 *
 * There is no single right answer to "how do you steer a bike with a thumb",
 * and the mainstream mobile racers all ship the same three or four options for
 * that reason. What they have in common is the right hand: throttle and brake
 * are always held buttons on the right, because they are the two controls that
 * must be analogue in *time* — you feather a brake, you do not tap it.
 *
 *   assist  two nudge pads, and the bike holds the line on its own. Default,
 *           because it is the one that works thirty seconds after install.
 *   tap     the same two pads with no assist. The scheme you graduate to.
 *   stick   a thumbstick, for riders who came from the on-foot controls.
 *   tilt    the phone is the wheel. Fastest for some people and unusable in a
 *           car or in bed, which is why it is never the default.
 *
 * ── One-thumb-per-side ───────────────────────────────────────────────────
 *
 * Every scheme keeps steering strictly on the left and the verbs strictly on
 * the right, so the game is playable with the phone held in two hands and
 * neither thumb ever crossing the middle. Tilt is the exception that proves
 * it: it frees the left hand entirely, and the left cluster is then empty.
 */

export function RaceTouchControls() {
  const scheme = usePlayerSettings((s) => s.raceScheme);

  // Never leave a control held for the next race, and never leave the assist
  // flag set for a rider who has just switched to a scheme without one.
  useEffect(() => releaseRaceTouch, []);
  useEffect(() => {
    raceTouch.assist = scheme === "assist";
    return () => {
      raceTouch.assist = false;
    };
  }, [scheme]);

  // A control held when the tab goes away stays held forever: the pointerup
  // lands on a page that is no longer listening.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") releaseRaceTouch();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", releaseRaceTouch);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", releaseRaceTouch);
    };
  }, []);

  return (
    <>
      <SteeringControls scheme={scheme} />

      {/* The right hand. Identical in every scheme, deliberately: the scheme
          setting changes how you steer and nothing else, so switching does not
          cost you the muscle memory for everything else. */}
      <ThumbCluster side="right">
        <ThumbStack>
          <TouchButton
            label="LOOK"
            size="sm"
            accent="var(--color-dim)"
            onPress={() => {
              raceTouch.lookBack = true;
            }}
            onRelease={() => {
              raceTouch.lookBack = false;
            }}
          />
          <TouchButton
            label="BACK"
            size="sm"
            accent="var(--color-dim)"
            onPress={() => {
              raceTouch.reverse = true;
            }}
            onRelease={() => {
              raceTouch.reverse = false;
            }}
          />
        </ThumbStack>

        <ThumbStack>
          <TouchButton
            label="DRIFT"
            size="md"
            accent="var(--color-accent)"
            onPress={() => {
              raceTouch.drift = true;
            }}
            onRelease={() => {
              raceTouch.drift = false;
            }}
          />
          <TouchButton
            label="BRAKE"
            size="md"
            accent="var(--color-danger)"
            onPress={() => {
              raceTouch.brake = true;
            }}
            onRelease={() => {
              raceTouch.brake = false;
            }}
          />
        </ThumbStack>

        <ThumbStack>
          <TouchButton
            label="BOOST"
            size="md"
            accent="#ffffff"
            onPress={() => {
              raceTouch.boost = true;
            }}
            onRelease={() => {
              raceTouch.boost = false;
            }}
          />
          {/* The one control the thumb rests on for the whole race, so it is
              the biggest, lowest and furthest into the corner. */}
          <TouchButton
            label="GO"
            size="lg"
            accent="var(--color-accent)"
            onPress={() => {
              raceTouch.throttle = true;
            }}
            onRelease={() => {
              raceTouch.throttle = false;
            }}
          />
        </ThumbStack>
      </ThumbCluster>
    </>
  );
}

function SteeringControls({ scheme }: { scheme: RaceScheme }) {
  if (scheme === "stick") return <StickSteering />;
  if (scheme === "tilt") return <TiltSteering />;
  // `assist` and `tap` share the pads; the difference is the assist flag,
  // which the parent owns. Two schemes, one control — which is the honest
  // description of what they are.
  return <PadSteering />;
}

function StickSteering() {
  // The stick writes to ecctrl's joystick store, which the bike already reads.
  // Its Y is ignored there: a bike does not go sideways, and pushing a stick
  // "up" to accelerate while also pushing it left to turn is one thumb doing
  // two jobs badly.
  return (
    <Joystick
      joystickMaxRadius={46}
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
  );
}

/**
 * Two pads. Held, not tapped — steering is a duration, not an event.
 *
 * Wide rather than round because a steering pad is aimed at with the side of a
 * thumb rolling left and right, not placed on with a fingertip: 104×64 is one
 * thumb-roll each way, and the pair is still under the width of a phone in
 * portrait.
 */
function PadSteering() {
  const press = (dir: number) => () => {
    raceTouch.steer = dir;
  };
  const release = (dir: number) => () => {
    // Only clear if we are still the one holding it — releasing left while
    // right is already down must not centre the wheel.
    if (raceTouch.steer === dir) raceTouch.steer = 0;
  };

  return (
    <ThumbCluster side="left">
      <TouchButton
        label="◀"
        size="md"
        square
        accent="var(--color-accent)"
        style={{ width: 104, fontSize: 20, letterSpacing: 0 }}
        onPress={press(-1)}
        onRelease={release(-1)}
      />
      <TouchButton
        label="▶"
        size="md"
        square
        accent="var(--color-accent)"
        style={{ width: 104, fontSize: 20, letterSpacing: 0 }}
        onPress={press(1)}
        onRelease={release(1)}
      />
    </ThumbCluster>
  );
}

/** Degrees of tilt for full lock. A wrist, not a shoulder. */
const TILT_FULL = 24;
/** Ignore the first couple of degrees, or the bike never sits still. */
const TILT_DEADZONE = 2.5;

/**
 * Tilt steering.
 *
 * Two things make this work rather than merely function:
 *
 *  - It is calibrated, not absolute. Nobody holds a phone flat, and "level"
 *    lying down is thirty degrees from "level" sitting up. The zero is taken
 *    when the scheme is armed, and re-taken on demand.
 *  - It reads the axis that matches the screen orientation. In portrait a
 *    left-right tilt is `gamma`; rotate the phone into landscape and the same
 *    physical motion arrives as `beta`, with a sign that depends on which way
 *    it was rotated. Reading gamma unconditionally gives a game that steers
 *    correctly in portrait and turns the wrong way in landscape, which is the
 *    orientation people actually race in.
 *
 * iOS requires a user gesture before it will hand out orientation events at
 * all, hence the arming button. Everywhere else the permission call is absent
 * and the listener attaches immediately.
 */
type PermissionCapable = {
  requestPermission?: () => Promise<PermissionState | "granted" | "denied">;
};

/** Does this browser gate orientation events behind a user gesture? (iOS does.) */
function tiltNeedsPermission(): boolean {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const ctor = DeviceOrientationEvent as unknown as PermissionCapable;
  return typeof ctor.requestPermission === "function";
}

function TiltSteering() {
  // Decided on the first render rather than in an effect: the answer depends
  // only on the browser, this component never renders on the server, and a
  // setState in an effect would cascade a render for a value that was already
  // knowable.
  const [needsPermission, setNeedsPermission] = useState(tiltNeedsPermission);
  const [armed, setArmed] = useState(() => !tiltNeedsPermission());
  const zero = useRef<number | null>(null);

  useEffect(() => {
    if (!armed) return;

    const onTilt = (e: DeviceOrientationEvent) => {
      const angle =
        (typeof screen !== "undefined" && screen.orientation?.angle) || 0;
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      // Portrait: rolling the phone left and right is gamma. Landscape: the
      // same physical roll is beta, and its sign flips with which way the
      // phone was turned.
      const raw =
        angle === 90 ? beta : angle === 270 || angle === -90 ? -beta : gamma;

      if (zero.current === null) zero.current = raw;
      const off = raw - zero.current;
      const magnitude = Math.max(0, Math.abs(off) - TILT_DEADZONE);
      const steer = Math.sign(off) * Math.min(1, magnitude / TILT_FULL);
      raceTouch.steer = Number.isFinite(steer) ? steer : 0;
    };

    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("deviceorientation", onTilt);
      raceTouch.steer = 0;
    };
  }, [armed]);

  const arm = async () => {
    const ctor = DeviceOrientationEvent as unknown as PermissionCapable;
    try {
      const res = await ctor.requestPermission?.();
      if (res === "granted") {
        zero.current = null;
        setArmed(true);
        setNeedsPermission(false);
      }
    } catch {
      /* refused, or not a gesture the browser accepted — the button stays */
    }
  };

  return (
    <ThumbCluster side="left">
      {needsPermission ? (
        <button
          onClick={arm}
          className="hud-chip hud-chip--primary pointer-events-auto"
          style={{ minHeight: 48, paddingInline: 16 }}
        >
          Enable tilt
        </button>
      ) : (
        <TouchButton
          label="LEVEL"
          size="sm"
          accent="var(--color-dim)"
          onPress={() => {
            // Re-zero to however the phone is being held right now. Racing
            // lying down is a different "level" from racing at a desk.
            zero.current = null;
          }}
        />
      )}
    </ThumbCluster>
  );
}
