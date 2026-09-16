"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { playerFocus } from "@/components/play/camera-rig";
import { CABINETS } from "@/arcade/registry";
import { useArcade } from "@/arcade/store";

/**
 * The cabinets, standing in the world.
 *
 * ── Where these appear, and where they deliberately do not ───────────────
 *
 * Only in built-in sandbox worlds. The spec puts them in a room near spawn on
 * the assumption of one world; this game has many, and most of them belong to
 * somebody. Dropping four glowing boxes into a world a player built would be
 * defacing it, and dropping them into a parkour course would put furniture on
 * a timed route. A sandbox is ours, has nothing to complete, and is exactly
 * the place somebody is standing around with nothing to do — which is the
 * moment the arcade is for. `/arcade` is the door for everyone else.
 *
 * ── The proximity test does not touch React ──────────────────────────────
 *
 * Distance is compared squared, in `useFrame`, against a module-level vector
 * the camera rig already updates. State is written only when the boolean
 * actually flips, so walking up to a cabinet costs two renders rather than one
 * per frame. Section 5.1 is explicit about this and it is the difference
 * between a prompt and a stutter.
 *
 * ── One InstancedMesh for the bodies ─────────────────────────────────────
 *
 * Seven cabinets are seven draw calls otherwise, in a scene that already
 * counts them. The screens are separate because they are the one part that differs —
 * and because an emissive plane wants its own material, not an instance
 * colour.
 */

/** How close counts as "at" a cabinet, in world units. Compared squared. */
const REACH = 3;
const REACH_SQ = REACH * REACH;

/** Cabinet box, in world units. Roughly a person and a half tall. */
const BODY = { w: 1.1, h: 2, d: 0.9 };

/**
 * Shared across every cabinet in every world, made once at module scope.
 *
 * Two materials, not eight. A `MeshStandardMaterial` per instance would also
 * defeat the instanced mesh it is attached to.
 */
const BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#1b2452",
  roughness: 0.55,
  metalness: 0.2,
});

const BODY_GEOMETRY = new THREE.BoxGeometry(BODY.w, BODY.h, BODY.d);
const SCREEN_GEOMETRY = new THREE.PlaneGeometry(BODY.w * 0.72, BODY.h * 0.34);

/**
 * Where the cabinets stand, relative to the world's spawn.
 *
 * Two rows: the four that came first, and a second row two units behind
 * them for the puzzle cabinets. The back row is staggered between the
 * front row's gaps so every screen is visible from the spawn.
 */
const OFFSETS: Array<[number, number]> = [
  [-2.4, -4],
  [-0.8, -4],
  [0.8, -4],
  [2.4, -4],
  [-1.6, -6],
  [0, -6],
  [1.6, -6],
];

export function ArcadeCabinets({ spawn }: { spawn: [number, number, number] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [nearIndex, setNearIndex] = useState<number | null>(null);
  const near = useRef<number | null>(null);
  const open = useArcade((s) => s.open);
  const activeGame = useArcade((s) => s.activeGame);

  // Only as many cabinets as there are games to put in them. An empty box the
  // player can walk up to and not use is worse than no box.
  const entries = CABINETS.slice(0, OFFSETS.length);

  const positions = useMemo(
    () =>
      entries.map((_, i) => {
        const [dx, dz] = OFFSETS[i];
        // Half a body up, because the spawn is floor level and a box is placed
        // by its centre.
        return new THREE.Vector3(spawn[0] + dx, spawn[1] + BODY.h / 2, spawn[2] + dz);
      }),
    [entries, spawn]
  );

  // The instance transforms are written once: cabinets do not move.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      matrix.makeTranslation(positions[i].x, positions[i].y, positions[i].z);
      m.setMatrixAt(i, matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [positions]);

  useFrame(() => {
    // Nothing to be near while a game is already up, and checking would keep
    // the prompt flickering behind the overlay.
    if (activeGame) return;

    let found: number | null = null;
    let bestSq = REACH_SQ;
    for (let i = 0; i < positions.length; i++) {
      const d2 = positions[i].distanceToSquared(playerFocus);
      if (d2 < bestSq) {
        bestSq = d2;
        found = i;
      }
    }
    // The whole point: React hears about this at most twice per approach.
    if (found !== near.current) {
      near.current = found;
      setNearIndex(found);
    }
  });

  // `E` opens whatever is in reach. Bound on the window rather than through
  // KeyboardControls for the reason `lib/keybinds.ts` gives about toggles: an
  // entry there is a boolean you poll, and polling one re-fires it every frame
  // the key is held.
  useEffect(() => {
    if (nearIndex === null) return;
    const entry = entries[nearIndex];
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code !== "KeyE") return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      // The overlay releases the pointer lock on mount and the world reclaims
      // it on the next click, which is the path it already uses coming back
      // from any other panel.
      open(entry.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearIndex, entries, open]);

  const prompt = nearIndex !== null ? entries[nearIndex] : null;

  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[BODY_GEOMETRY, BODY_MATERIAL, entries.length]}
        castShadow
        receiveShadow
      />

      {positions.map((p, i) => (
        <mesh
          key={entries[i].id}
          geometry={SCREEN_GEOMETRY}
          // Facing +Z, which is where the offsets put the player.
          position={[p.x, p.y + 0.45, p.z + BODY.d / 2 + 0.01]}
        >
          {/* Emissive rather than lit: a screen that goes dark at night is a
              screen nobody notices, and this is the only thing marking the
              cabinets out from the blocks around them. */}
          <meshStandardMaterial
            color="#0b1030"
            emissive={nearIndex === i ? "#67e8f9" : "#22d3ee"}
            emissiveIntensity={nearIndex === i ? 1.6 : 0.7}
            toneMapped={false}
          />
        </mesh>
      ))}

      {prompt && nearIndex !== null && (
        <Html
          position={[
            positions[nearIndex].x,
            positions[nearIndex].y + BODY.h / 2 + 0.4,
            positions[nearIndex].z,
          ]}
          center
          // A DOM label rather than 3D text, the same call `Peers` makes:
          // troika would fetch a font over the network for a two-word prompt.
          style={{ pointerEvents: "none" }}
        >
          <div className="hud-chip whitespace-nowrap">
            <strong>E</strong>
            <span>{prompt.title}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
