"use client";

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { useEditorStore } from "@/stores/editor-store";
import { useArenaStore } from "@/stores/arena-store";
import { attack, joinMatch, leaveMatch } from "@/lib/net/arena";
import type { PartTuple, PropInstance, WorldDoc } from "@/lib/worlddoc";

import { InstancedParts } from "@/components/editor/InstancedParts";
import { PlacedProps } from "@/components/editor/PlacedProps";
import { Player } from "@/components/play/Player";
import { Peers } from "@/components/play/Peers";
import { WorldColliders } from "@/components/play/WorldColliders";
import { PropColliders } from "@/components/play/PropColliders";
import { keyboardMap } from "@/components/play/controls";
import { playerFocus } from "@/components/play/camera-rig";
import { FollowSun } from "@/components/FollowSun";
import { FrameLimiter } from "@/components/FrameLimiter";
import { ArenaHud } from "./ArenaHud";
import { useRenderQuality } from "@/lib/quality";

/**
 * A match: the play half of WorldCanvas with the editor taken out.
 *
 * Not a mode of WorldCanvas, because nothing here can ever become an editor —
 * there is no build toggle, no save, no read-only banner, and the world it
 * stands on is whatever the room says it is. What it does share is every part
 * that draws or simulates a world, so a match and a solo play session are the
 * same scene with a different set of rules on top.
 */
interface Snapshot {
  parts: PartTuple[];
  props: PropInstance[];
  spawn: [number, number, number];
}

export default function ArenaCanvas({
  code,
  worldId,
}: {
  code: string;
  worldId: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [painted, setPainted] = useState(false);
  const quality = useRenderQuality();
  const error = useArenaStore((s) => s.error);

  const onWorld = useCallback((doc: WorldDoc) => {
    // The room's copy is the one everybody is standing on, so it goes into the
    // same store the renderer reads — read-only, because a match is not a place
    // where anything gets built.
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
    void joinMatch(code, worldId, onWorld).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose?.();
      leaveMatch();
    };
  }, [code, worldId, onWorld]);

  // Swing: F or Enter on a keyboard, the HUD button on a touch screen. Not part
  // of the drei keyboard map — that one drives ecctrl's movement state, and an
  // attack is an event, not a held direction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyF" || e.code === "Enter") attack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const getFocus = useMemo(() => () => playerFocus, []);

  if (error && !snapshot) {
    return (
      <div className="bg-steel-900 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-steel-050 max-w-sm text-sm">{error}</p>
        <Link href="/arena" className="hud-chip hud-chip--primary">
          Back to matches
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-steel-900 relative min-h-0 flex-1">
      <Canvas
        // Not "always": R3F's own loop renders on every rAF, so a 120Hz phone
        // renders twice the frames the game needs. <FrameLimiter> drives the
        // loop at 60 instead. See components/FrameLimiter.tsx.
        frameloop="never"
        // Capped below the browser's own ratio on phones: a voxel world is
        // fragment-bound, and a DPR-3 screen otherwise renders every pixel
        // four times over. See lib/quality.ts.
        dpr={quality.dpr}
        shadows
        camera={{ position: [16, 16, 16], fov: 50 }}
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
        {/* First child, so the loop is running before anything below it has a
            frame to be rendered in. */}
        <FrameLimiter fps={60} />

        <hemisphereLight args={["#c8d2dd", "#1a1d21", 1.15]} />
        <FollowSun extent={34} getFocus={getFocus} />

        <InstancedParts />
        {snapshot && <PlacedProps props={snapshot.props} />}
        <Peers />

        <Physics timeStep={1 / 60} paused={!snapshot}>
          {snapshot && (
            <>
              <KeyboardControls map={keyboardMap}>
                <Player spawn={snapshot.spawn} />
              </KeyboardControls>
              <WorldColliders parts={snapshot.parts} />
              <PropColliders props={snapshot.props} />
            </>
          )}
        </Physics>
      </Canvas>

      <ArenaHud code={code} onAttack={attack} />

      {(!painted || !snapshot) && (
        <div className="bg-steel-900 absolute inset-0 flex flex-col items-center justify-center gap-4">
          <span className="border-signal h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="hud-label">Joining match {code}</span>
        </div>
      )}
    </div>
  );
}
