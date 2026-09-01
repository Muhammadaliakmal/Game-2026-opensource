"use client";

import * as THREE from "three";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls, type KeyboardControlsEntry } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import { parseWorldDoc, type PartTuple, type Vec3 } from "@/lib/worlddoc";
import { InstancedWorld } from "./InstancedWorld";
import { WorldColliders } from "./WorldColliders";
import { Player } from "./Player";

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

// ecctrl v2 consumes this drei context directly for movement — no explicit
// wiring. Player only reads `jump` out of it, for the jump-feel edge detection.
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

export default function PlayCanvas({ worldId }: { worldId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [world, setWorld] = useState<Loaded | null>(null);

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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-red-500">{error}</p>
        <Link
          href={`/build/${worldId}`}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
        >
          Back to build
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      <Canvas
        shadows
        camera={{ position: [8, 6, 8], fov: 65 }}
        // preserveDrawingBuffer is here now so Phase 4's thumbnail capture
        // (`gl.domElement.toDataURL()`) doesn't need a Canvas config change.
        gl={{ powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color("#0b1120");
        }}
      >
        <hemisphereLight args={["#dbeafe", "#0f172a", 1.1]} />
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
              Temporary spawn pad. Builds are all at y >= 0 (the editor grid
              floor), so without a little ground under the spawn point an empty
              or sparse world would just be an endless fall/respawn loop. Kept
              small on purpose: step off it and the real fall-out loop
              (FEEL.fallOutY -> respawn) still works everywhere else.
            */}
            <RigidBody
              type="fixed"
              colliders="cuboid"
              position={[world.spawn[0], world.spawn[1] - 1.5, world.spawn[2]]}
            >
              <mesh scale={[8, 1, 8]} receiveShadow>
                <boxGeometry />
                <meshStandardMaterial color="#0f172a" roughness={1} />
              </mesh>
            </RigidBody>
          </Physics>
        )}
      </Canvas>

      {/* DOM HUD, outside the Canvas — cheaper than in-scene UI. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto rounded-lg bg-black/70 px-3 py-2 text-sm text-zinc-200 backdrop-blur">
          {world?.name ?? "Loading…"}
        </div>
        <Link
          href={`/build/${worldId}`}
          className="pointer-events-auto rounded-lg bg-black/70 px-3 py-2 text-sm text-zinc-200 backdrop-blur transition-colors hover:bg-black/85"
        >
          Edit
        </Link>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <div className="rounded-lg bg-black/60 px-3 py-2 text-xs text-zinc-300 backdrop-blur">
          WASD move · Shift run · Space jump
        </div>
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-zinc-300">
          Loading world…
        </div>
      )}
    </div>
  );
}
