"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Canvas, useFrame } from "@react-three/fiber";
import { KeyboardControls, type KeyboardControlsEntry } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import { parseWorldDoc, type PartTuple, type Vec3 } from "@/lib/worlddoc";
import { InstancedWorld } from "./InstancedWorld";
import { WorldColliders } from "./WorldColliders";
import { Player } from "./Player";
import { TouchControls, useTouchControls } from "./TouchControls";
import { playerFocus, recenterPitch, useViewStore } from "./camera-rig";
import { requestRespawn } from "./play-actions";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { RemixButton } from "@/components/RemixButton";
import { FollowSun } from "@/components/FollowSun";

// Live game-feel tuning panel — dev only. `dynamic` keeps leva out of the main
// bundle; the DEV gate keeps it from ever rendering in a production build.
const DEV = process.env.NODE_ENV !== "production";
const FeelTuner = dynamic(() => import("./feel/FeelTuner"), { ssr: false });

/**
 * Play mode: the world loaded from the DB, stood up in Rapier, walked around
 * with ecctrl.
 *
 * The editor and this share almost no runtime: the editor never touches
 * physics, and Play never mutates the world. So rather than reuse
 * EditorCanvas, Play gets its own Canvas with `frameloop` left at the default
 * "always" (physics needs every frame; the editor deliberately runs "demand").
 */

type Control =
  | "forward"
  | "backward"
  | "leftward"
  | "rightward"
  | "jump"
  | "run";

// drei only captures keys into a store — ecctrl v2 reads nothing on its own,
// so Player forwards every field of this map into setMovement each frame.
const keyboardMap: KeyboardControlsEntry<Control>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "leftward", keys: ["ArrowLeft", "KeyA"] },
  { name: "rightward", keys: ["ArrowRight", "KeyD"] },
  { name: "jump", keys: ["Space"] },
  { name: "run", keys: ["ShiftLeft", "ShiftRight"] },
];

interface Loaded {
  parts: PartTuple[];
  spawn: Vec3;
  name: string;
  /** Whether the viewer may edit this world, which decides Edit vs Remix. */
  canEdit: boolean;
}

/**
 * Fires once, on the first rendered frame. The world fetch resolves in
 * milliseconds, but standing up Rapier + the PMREM probe + 7k instances takes
 * noticeably longer on a phone — long enough that the loading cover used to
 * clear onto an unpainted (white) canvas. This keeps the cover up until there's
 * actually something on screen.
 */
function FirstFrame({ onPainted }: { onPainted: () => void }) {
  useFrame(() => onPainted());
  return null;
}

/**
 * Drag-to-look is invisible until someone tries it, so say so once. Fades on a
 * timer rather than waiting for a dismiss tap — a tap here would be a tap the
 * player meant to spend on looking around.
 */
function TouchHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3 transition-opacity duration-700 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="hud-panel px-3.5 py-2 text-center text-[0.6875rem] leading-relaxed font-bold tracking-[0.06em] text-zinc-300 uppercase">
        Drag anywhere to look · Tap{" "}
        <span className="text-neon">Run</span> to sprint
      </div>
    </div>
  );
}

export default function PlayCanvas({ worldId }: { worldId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [world, setWorld] = useState<Loaded | null>(null);
  // Drop the loading cover only once the scene has painted a frame — or after a
  // hard timeout, so a device that never gets a WebGL context isn't stranded on
  // the spinner forever.
  const [painted, setPainted] = useState(false);
  const touch = useTouchControls();

  useEffect(() => {
    if (painted) return;
    const t = setTimeout(() => setPainted(true), 8000);
    return () => clearTimeout(t);
  }, [painted]);

  const firstPerson = useViewStore((s) => s.firstPerson);
  const toggleFirstPerson = useViewStore((s) => s.toggleFirstPerson);

  // Leaving the game while still fullscreen strands the user in a chromeless
  // window, so drop out of it on the way to another route.
  const leaveFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
  };

  // V toggles the view, C levels it out. Bound to the window rather than the
  // canvas so they work without clicking into the scene first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "v" || e.key === "V") toggleFirstPerson();
      if (e.key === "c" || e.key === "C") recenterPitch();
      if (e.key === "r" || e.key === "R") requestRespawn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFirstPerson]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/worlds/${worldId}`);
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "This world does not exist, or it is not published."
              : `Could not load this world (${res.status}).`
          );
        }
        const row = await res.json();
        const doc = parseWorldDoc(row.doc);
        if (cancelled) return;
        setWorld({
          parts: doc.parts,
          spawn: doc.spawn,
          name: doc.name,
          // Built-ins and other people's worlds can be opened in the editor but
          // never saved, so offering "Edit" on them is a trap.
          canEdit: !row.builtIn && row.isOwner === true,
        });
        setStatus("ready");

        // Fire-and-forget: a lost play count is never worth interrupting
        // someone's game over, and the server skips the owner's own replays.
        void fetch(`/api/worlds/${worldId}/play`, { method: "POST" }).catch(
          () => {}
        );
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load this world.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  if (status === "error") {
    return (
      <div className="bg-void flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-flare max-w-sm text-sm font-semibold">{error}</p>
        {/* Deliberately not "back to build": if the world could not be loaded,
            the editor cannot load it either. */}
        <div className="flex gap-2">
          <Link href="/" className="hud-chip hud-chip--neon">
            Your worlds
          </Link>
          <Link href="/browse" className="hud-chip">
            Browse worlds
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-void relative min-h-0 flex-1">
      <Canvas
        shadows
        className="bg-void"
        camera={{ position: [8, 6, 8], fov: 65 }}
        // `preserveDrawingBuffer` stays for Phase 4's thumbnail capture
        // (`gl.domElement.toDataURL()`). `powerPreference` is left at the
        // default: pairing "high-performance" with preserveDrawingBuffer makes
        // some Android GPUs hand back a context that never paints (blank white
        // canvas), and a phone has only the one GPU to pick anyway.
        gl={{ preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color("#080b1a");
          // Distance fade into the void — without it the world just stops at a
          // hard edge and the level reads as a floating diorama.
          scene.fog = new THREE.Fog("#080b1a", 40, 130);
          // A locally-generated room probe: without an environment map the
          // `metal` finish has nothing to reflect and renders as a flat dark
          // patch. RoomEnvironment needs no HDR download.
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.4;
          pmrem.dispose();
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <hemisphereLight args={["#a5b4fc", "#0b1024", 1.15]} />
        {/* Shadow box rides with the character, so a course that runs 90 units
            from the origin is lit the same at both ends. */}
        <FollowSun getFocus={() => playerFocus} extent={34} />

        {!painted && <FirstFrame onPainted={() => setPainted(true)} />}

        {world && (
          // Fixed timestep, not "vary": ecctrl holds the character on a spring
          // and integrates it as force * world.timestep, tuned for ~1/60 steps.
          // On a slow device "vary" feeds it frame deltas of 50-200ms+, the
          // spring overshoots instead of settling, and the character gets
          // flung into the air ("flying"). The fixed-timestep accumulator
          // keeps stepping at 1/60 no matter how slowly the scene renders.
          <Physics timeStep={1 / 60}>
            <KeyboardControls map={keyboardMap}>
              <Player spawn={world.spawn} />
            </KeyboardControls>

            <InstancedWorld parts={world.parts} />
            <WorldColliders parts={world.parts} />

            {/*
              Safety pad for an empty world only. Without some ground under the
              spawn point a blank world is just an endless fall/respawn loop —
              but a built world (every new world ships the parkour course) has
              its own floor, and a pad there would sit inside the geometry and
              block the fall-out loop.
            */}
            {world.parts.length === 0 && (
            <RigidBody
              type="fixed"
              colliders="cuboid"
              position={[world.spawn[0], world.spawn[1] - 1.5, world.spawn[2]]}
            >
              <mesh scale={[8, 1, 8]} receiveShadow>
                <boxGeometry />
                <meshStandardMaterial
                  color="#161c42"
                  roughness={0.85}
                  emissive="#22d3ee"
                  emissiveIntensity={0.06}
                />
              </mesh>
            </RigidBody>
            )}
          </Physics>
        )}
      </Canvas>

      {/* DOM HUD, outside the Canvas — cheaper than in-scene UI.
          On a phone the control cluster is wider than the viewport, so the bar
          stacks (title over controls) and the controls scroll sideways rather
          than spilling off both edges. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-2 sm:flex-row sm:flex-wrap sm:justify-between sm:p-3">
        <div className="hud-panel pointer-events-auto flex min-w-0 max-w-full items-center gap-2.5 px-3 py-2">
          <span className="bg-mint h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_var(--color-mint)]" />
          <span className="truncate text-[0.6875rem] font-bold tracking-[0.09em] uppercase">
            {world?.name ?? "Loading…"}
          </span>
        </div>
        <div className="hud-scroll pointer-events-auto flex max-w-full overflow-x-auto sm:overflow-visible">
          <div className="hud-panel flex shrink-0 items-center gap-1.5 p-1.5">
          <button
            onClick={toggleFirstPerson}
            className={`hud-chip ${firstPerson ? "hud-chip--neon" : ""}`}
            title="Switch between first and third person (V)"
            aria-pressed={firstPerson}
          >
            {firstPerson ? "1st" : "3rd"}
          </button>
          <button
            onClick={recenterPitch}
            className="hud-chip"
            title="Level the view (C)"
            aria-label="Level the view"
          >
            ⌖
          </button>
          <button
            onClick={requestRespawn}
            className="hud-chip"
            title="Back to the start (R)"
          >
            ↻ Respawn
          </button>
          <span className="hud-divider" />
          <MuteButton className="hud-chip" />
          <FullscreenButton className="hud-chip" />
          <span className="hud-divider" />
          {world?.canEdit ? (
            <Link
              href={`/build/${worldId}`}
              onClick={leaveFullscreen}
              className="hud-chip"
            >
              Edit
            </Link>
          ) : (
            world && (
              // Someone who just played a world they like should be one click
              // from building on it — that fork is the whole share loop.
              <RemixButton from={worldId} name={world.name} />
            )
          )}
          <Link
            href="/"
            onClick={leaveFullscreen}
            className="hud-chip hud-chip--flare"
            title="Leave the game and go back to your worlds"
          >
            Exit
          </Link>
        </div>
        </div>
      </div>

      {/* The keyboard legend is noise once thumb controls are on screen — and
          it would sit right under the joystick. */}
      {!touch && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-3">
          <div className="hud-panel flex items-center gap-2.5 px-3.5 py-2">
            {[
              ["WASD", "move"],
              ["Shift", "run"],
              ["Space", "jump"],
              ["Drag", "look"],
              ["V", "view"],
              ["R", "respawn"],
            ].map(([key, action]) => (
              <span key={key} className="flex items-center gap-1.5">
                <kbd className="bg-raised text-ink rounded-md px-1.5 py-0.5 font-mono text-[0.625rem] font-bold ring-1 ring-white/10">
                  {key}
                </kbd>
                <span className="hud-label">{action}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {touch && status === "ready" && painted && <TouchControls />}
      {touch && status === "ready" && painted && <TouchHint />}

      {(status === "loading" || !painted) && (
        <div className="bg-void absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
          <span className="border-neon h-8 w-8 animate-spin rounded-full border-2 border-t-transparent shadow-[0_0_18px_-4px_var(--color-neon)]" />
          <span className="hud-label">Loading world</span>
        </div>
      )}

      {DEV && <FeelTuner />}
    </div>
  );
}
