"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { InstancedWorld } from "@/components/play/InstancedWorld";
import { BlockSurfaces } from "@/components/BlockSurfaces";
import { FollowSun } from "@/components/FollowSun";
import { PostFX } from "@/components/PostFX";
import { PerfProbe } from "@/components/perf/PerfProbe";
import { PerfPanel } from "@/components/perf/PerfPanel";
import { FINISHES, TEXTURES, type PartTuple } from "@/lib/worlddoc";

/**
 * Every surface, on one canvas, under the editor's studio rig.
 *
 * Rows are surfaces (plain first), columns are the four finishes, and each
 * block is drawn in three palette colours side by side — grey, green and a
 * saturated blue — because the tint model has to be judged where it is
 * hardest: a photographic texture under a colour the photograph never had.
 * A floor of the row's surface runs under each, with a ramp and a wedge at
 * the end, so the triplanar projection is seen on every shape it has to
 * cover and the floor's tiling across cells is visible.
 */
const COLOURS = [29, 24, 19]; // #a8a29e, #22c55e, #3b82f6
const focus = new THREE.Vector3(12, 0, 12);

function showcaseParts(): PartTuple[] {
  const parts: PartTuple[] = [];
  TEXTURES.forEach((_, t) => {
    const z = t * 3;
    // The row's floor: plain grey, in this surface, under everything.
    for (let x = 0; x < 20; x++) {
      for (let dz = 0; dz < 2; dz++) parts.push([x, 0, z + dz, 0, 29, 0, 0, t]);
    }
    FINISHES.forEach((_, f) => {
      COLOURS.forEach((c, ci) => {
        parts.push([f * 4 + ci, 1, z, 0, c, f, 0, t]);
      });
    });
    // A slab, a ramp and a wedge in the row's surface, plain matte.
    parts.push([16, 1, z, 1, 29, 0, 0, t]);
    parts.push([17, 1, z, 2, 29, 0, 0, t]);
    parts.push([18, 1, z, 3, 29, 0, 0, t]);
  });
  return parts;
}

/** `?cam=x,y,z&at=x,y,z` — a repeatable viewpoint, for comparing two builds. */
function viewFromUrl(): { cam: [number, number, number]; at: [number, number, number] } {
  const q = new URLSearchParams(window.location.search);
  const read = (key: string, fallback: [number, number, number]) => {
    const v = q.get(key)?.split(",").map(Number);
    return v && v.length === 3 && v.every(Number.isFinite)
      ? (v as [number, number, number])
      : fallback;
  };
  return { cam: read("cam", [24, 18, 44]), at: read("at", [10, 1, 16]) };
}

export default function SurfacesCanvas() {
  const parts = useMemo(() => showcaseParts(), []);
  const view = useMemo(() => viewFromUrl(), []);
  return (
    <div className="relative h-[80dvh] w-full">
      <Canvas
        frameloop="demand"
        // "percentage" = PCF, named outright. Bare `shadows` is PCFSoft, which three
        // r185 deprecates and swaps for PCF on the first shadow pass, after every
        // material had already compiled for PCFSoft: each shader compiled twice.
        shadows="percentage"
        camera={{ position: view.cam, fov: 45 }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color("#14171a");
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.4;
          pmrem.dispose();
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <hemisphereLight args={["#c8d2dd", "#1a1d21", 1.15]} />
        <FollowSun getFocus={() => focus} extent={30} />
        <InstancedWorld parts={parts} />
        <BlockSurfaces />
        <OrbitControls makeDefault target={view.at} enableDamping />
        {/* Play's post chain, so the emissive rows are judged with the bloom
            they will actually have; and the perf probe, so this page doubles
            as the check that the probe reads whole frames under a composer. */}
        <PostFX />
        <PerfProbe />
      </Canvas>
      <PerfPanel />
    </div>
  );
}
