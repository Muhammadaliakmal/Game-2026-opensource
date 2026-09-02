"use client";

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import Link from "next/link";
import type { PartTuple, PropInstance, WorldDoc } from "@/lib/worlddoc";
import { useEditorStore } from "@/stores/editor-store";
import { joinRace, leaveRace } from "@/lib/net/race";
import { playerFocus } from "@/components/play/camera-rig";
import { InstancedParts } from "@/components/editor/InstancedParts";
import { PlacedProps } from "@/components/editor/PlacedProps";
import { WorldColliders } from "@/components/play/WorldColliders";
import { PropColliders } from "@/components/play/PropColliders";
import { FollowSun } from "@/components/FollowSun";
import { useCoarsePointer } from "@/lib/use-media-query";
import { Bike } from "./Bike";
import { RaceRiders } from "./RaceRiders";
import { RaceHud } from "./RaceHud";
import { RaceTouchControls } from "./RaceTouchControls";
import { raceKeyboardMap } from "./controls";
import { useRenderQuality } from "@/lib/quality";

/**
 * The race canvas.
 *
 * Structurally the arena's twin: the track arrives from the room as one
 * snapshot on join, physics is paused until it has, and the world renders
 * through exactly the same InstancedParts the editor and Play use.
 *
 * The one real difference is what stands on it. A bike is a vehicle rather than
 * a character controller, so this mounts <Bike> under a vehicle key map instead
 * of <Player> — everything below that, colliders and lighting and the instanced
 * world, is unchanged.
 */

interface Snapshot {
  parts: PartTuple[];
  props: PropInstance[];
  spawn: [number, number, number];
}

export default function RaceCanvas({ code }: { code: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [painted, setPainted] = useState(false);
  const touch = useCoarsePointer();
  const quality = useRenderQuality();

  const onWorld = useCallback((doc: WorldDoc) => {
    // The track is read-only here, but it goes through the editor store for the
    // same reason the arena's does: InstancedParts renders from that store, and
    // a second path into it would be a second way for the two to disagree.
    useEditorStore.getState().loadDoc(doc);
    useEditorStore.getState().setReadOnly(true);
    setSnapshot({
      parts: doc.parts,
      props: doc.props,
      spawn: [doc.spawn[0], doc.spawn[1], doc.spawn[2]],
    });
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void joinRace(code, onWorld).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose?.();
      leaveRace();
    };
  }, [code, onWorld]);

  const getFocus = useMemo(() => () => playerFocus, []);

  return (
    <div className="bg-steel-900 relative min-h-0 flex-1">
      <Canvas
        frameloop="always"
        // Capped below the browser's own ratio on phones: a voxel world is
        // fragment-bound, and a DPR-3 screen otherwise renders every pixel
        // four times over. See lib/quality.ts.
        dpr={quality.dpr}
        shadows
        camera={{ position: [16, 16, 16], fov: 55 }}
        gl={{ failIfMajorPerformanceCaveat: false }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color("#14171a");
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.4;
          pmrem.dispose();
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          setPainted(true);
        }}
      >
        <hemisphereLight args={["#c8d2dd", "#1a1d21", 1.15]} />
        {/* Wider than the arena's: a bike covers ground fast enough that a
            tight shadow box pops its edge in front of the rider. */}
        <FollowSun extent={46} getFocus={getFocus} />

        <InstancedParts />
        {snapshot && <PlacedProps props={snapshot.props} />}
        <RaceRiders />

        <Physics timeStep={1 / 60} paused={!snapshot}>
          {snapshot && (
            <>
              <KeyboardControls map={raceKeyboardMap}>
                <Bike spawn={snapshot.spawn} />
              </KeyboardControls>
              <WorldColliders parts={snapshot.parts} />
              <PropColliders props={snapshot.props} />
            </>
          )}
        </Physics>
      </Canvas>

      <RaceHud code={code} />
      {snapshot && painted && touch && <RaceTouchControls />}

      {(!painted || !snapshot) && (
        <div className="bg-steel-900 absolute inset-0 flex flex-col items-center justify-center gap-4">
          <span className="border-signal h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="hud-label">Joining race {code}</span>
          <Link href="/race" className="hud-chip">
            Back
          </Link>
        </div>
      )}
    </div>
  );
}
