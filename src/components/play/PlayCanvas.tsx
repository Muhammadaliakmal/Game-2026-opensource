"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls, type KeyboardControlsEntry } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import { parseWorldDoc, type PartTuple, type Vec3 } from "@/lib/worlddoc";
import { InstancedWorld } from "./InstancedWorld";
import { WorldColliders } from "./WorldColliders";
import { Player } from "./Player";
import { TouchControls, useTouchControls } from "./TouchControls";
import { recenterPitch, useViewStore } from "./camera-rig";
import { requestRespawn } from "./play-actions";
import { FullscreenButton } from "@/components/FullscreenButton";

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
  const touch = useTouchControls();

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
        if (!res.ok) throw new Error(`Failed to load world (${res.status})`);
        const row = await res.json();
        const doc = parseWorldDoc(row.doc);
        if (cancelled) return;
        setWorld({ parts: doc.parts, spawn: doc.spawn, name: doc.name });
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load world");
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
        <p className="text-flare text-sm font-semibold">{error}</p>
        <Link href={`/build/${worldId}`} className="hud-chip hud-chip--neon">
          Back to build
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-void relative min-h-0 flex-1">
      <Canvas
        shadows
        camera={{ position: [8, 6, 8], fov: 65 }}
        // preserveDrawingBuffer is here now so Phase 4's thumbnail capture
        // (`gl.domElement.toDataURL()`) doesn't need a Canvas config change.
        gl={{ powerPreference: "high-performance", preserveDrawingBuffer: true }}
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
        <directionalLight
          position={[20, 30, 12]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-camera-far={140}
        />

        {world && (
          // "vary" timestep keeps the character from tunnelling through the
          // merged box colliders on a frame spike.
          <Physics timeStep="vary">
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

      {/* DOM HUD, outside the Canvas — cheaper than in-scene UI. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-3">
        <div className="hud-panel pointer-events-auto flex min-w-0 items-center gap-2.5 px-3 py-2">
          <span className="bg-mint h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_var(--color-mint)]" />
          <span className="max-w-[52vw] truncate text-[0.6875rem] font-bold tracking-[0.09em] uppercase">
            {world?.name ?? "Loading…"}
          </span>
        </div>
        <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1.5 p-1.5">
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
          <FullscreenButton className="hud-chip" />
          <span className="hud-divider" />
          <Link
            href={`/build/${worldId}`}
            onClick={leaveFullscreen}
            className="hud-chip"
          >
            Edit
          </Link>
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

      {touch && status === "ready" && <TouchControls />}
      {touch && status === "ready" && <TouchHint />}

      {status === "loading" && (
        <div className="bg-void/80 absolute inset-0 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
          <span className="border-neon h-8 w-8 animate-spin rounded-full border-2 border-t-transparent shadow-[0_0_18px_-4px_var(--color-neon)]" />
          <span className="hud-label">Loading world</span>
        </div>
      )}

      {DEV && <FeelTuner />}
    </div>
  );
}
