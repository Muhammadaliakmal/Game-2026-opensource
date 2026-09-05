"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import Link from "next/link";
import type { PartTuple, PropInstance, WorldDoc } from "@/lib/worlddoc";
import { useEditorStore } from "@/stores/editor-store";
import { joinRace, leaveRace } from "@/lib/net/race";
import { GameLoader } from "@/components/hud/GameLoader";
import { useRaceStore } from "@/stores/race-store";
import { playerFocus } from "@/components/play/camera-rig";
import { InstancedParts } from "@/components/editor/InstancedParts";
import { PlacedProps } from "@/components/editor/PlacedProps";
import { WorldColliders } from "@/components/play/WorldColliders";
import { PropColliders } from "@/components/play/PropColliders";
import { FollowSun } from "@/components/FollowSun";
import { FrameLimiter } from "@/components/FrameLimiter";
import { SunsetSky } from "@/components/sky/SunsetSky";
import { NightSky } from "@/components/sky/NightSky";
import { PerfProbe } from "@/components/perf/PerfProbe";
import { PerfPanel } from "@/components/perf/PerfPanel";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  NIGHT_LOOK,
  SUN_LIGHT_COLOR,
  SUN_LIGHT_INTENSITY,
  moonDirection,
  sunDirection,
} from "@/lib/atmosphere";
import { MAP_V2 } from "@/lib/map-v2";
import { useCoarsePointer } from "@/lib/use-media-query";
import { Bike } from "./Bike";
import { RaceRiders } from "./RaceRiders";
import { RaceHud } from "./RaceHud";
import { RaceTouchControls } from "./RaceTouchControls";
import { RideKeyboard } from "./RideKeyboard";
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

export default function RaceCanvas({
  code,
  target,
}: {
  code: string;
  /**
   * The grid size the lobby asked for, when this client is the one opening the
   * room. Ignored by the server on a join — see joinRace.
   */
  target?: number;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [painted, setPainted] = useState(false);
  const touch = useCoarsePointer();
  const quality = useRenderQuality();
  // Read here as well as in the HUD: a connection that never happens must not
  // leave a spinner claiming to be joining. ArenaCanvas already did this and
  // this file, copied from it, dropped the branch.
  const error = useRaceStore((s) => s.error);

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
    void joinRace(code, onWorld, target).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose?.();
      leaveRace();
    };
  }, [code, onWorld, target]);

  const getFocus = useMemo(() => () => playerFocus, []);

  // No room, no race. Say so plainly rather than spinning forever — "Joining
  // race ABC234" that never resolves reads as the grid being broken, when the
  // truth is that nothing was ever listening.
  if (error && !snapshot) {
    return (
      <div className="bg-base flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-ink max-w-md text-sm">{error}</p>
        <Link href="/race" className="hud-chip hud-chip--primary">
          Back to races
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-base relative min-h-0 flex-1">
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
        camera={{
          position: [16, 16, 16],
          fov: 55,
          // Both were three.js defaults: near 0.1 and far 2000, a 20,000:1
          // ratio spent on a track whose whole bounding box is 260 units. Most
          // of the depth buffer's precision was going to the 20cm in front of
          // the lens where nothing is ever drawn, and the coplanar top faces of
          // 6,340 road blocks are exactly the geometry that shows it as
          // shimmer. Safe to pin here because the race is always Neon Circuit —
          // the editor and Play canvases orbit user-built worlds of unknown
          // size and keep the defaults.
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
        }}
        // MSAA is left on by R3F's defaults, and a voxel world is fragment-
        // bound — so on the tiers that need the frames most it was paying for
        // antialiasing on every one of 2.5 million triangles' worth of
        // fragments. Hard-edged blocks lose least from going without.
        gl={{ antialias: quality.antialias, failIfMajorPerformanceCaveat: false }}
        onCreated={({ scene, gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;

          // The sky owns the background and the fog. It does NOT own the
          // environment probe, and that division is the whole lesson of the
          // night look: a probe generated from the visible dome is elegant and
          // renders every `metal` surface black, because metalness 1.0 means
          // the probe is the only thing lighting it and a night sky carries
          // about a fiftieth of the light a grey room does. So RoomEnvironment
          // stays, under every sky, and the world is lit the way it was built.
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.4;
          pmrem.dispose();
          if (!MAP_V2) scene.background = new THREE.Color("#14171a");

          setPainted(true);
        }}
      >
        {/* First child, so the loop is running before anything below it has a
            frame to be rendered in. */}
        <FrameLimiter fps={60} />

        {/* Night is the look. The sky owns the fill, the ambient, the fog and
            everything visible, so there is no second hemisphere light here —
            the neutral one that used to stand in would wash the black straight
            back out to grey.

            The sunset is still a complete, working sky and is what
            NEXT_PUBLIC_MAP_V2=1 selects. It is kept rather than deleted
            because nothing about it is wrong; it simply is not the direction
            this world is lit in. */}
        {MAP_V2 ? <SunsetSky /> : <NightSky />}

        {/* Wider than the arena's: a bike covers ground fast enough that a
            tight shadow box pops its edge in front of the rider.

            FollowSun stays the shadow-caster in both looks — MAP.md §5.1's
            follow-camera is already what it does. Under MAP_V2 it is pointed
            along the real sun direction and given its colour, so the shadows
            fall where the sun you can see says they should. */}
        <FollowSun
          extent={46}
          getFocus={getFocus}
          {...(MAP_V2
            ? {
                sunDir: sunDirection(),
                color: SUN_LIGHT_COLOR,
                intensity: SUN_LIGHT_INTENSITY,
              }
            : {
                // Moonlight: cool, weaker than the sun, and coming from 32
                // degrees up rather than 7 — so the track keeps readable
                // shadows instead of the shadow of every kerb reaching the
                // far rail.
                sunDir: moonDirection(),
                color: NIGHT_LOOK.keyColor,
                intensity: NIGHT_LOOK.keyIntensity,
                distance: NIGHT_LOOK.keyDistance,
              })}
        />

        {/* The racing surface is a single flat layer at y=0 — see circuit.ts,
            which is explicit that the track has no elevation change. That is
            what makes it safe to tell InstancedParts its shadow is wasted. */}
        <InstancedParts groundY={0} />
        {snapshot && <PlacedProps props={snapshot.props} />}
        <RaceRiders />

        <Physics timeStep={1 / 60} paused={!snapshot}>
          {snapshot && (
            <>
              {/* Colliders first, deliberately. React mounts children in order
                  and Rapier builds each collider as it goes, so a bike listed
                  above the track is a bike that exists for part of a commit
                  with no ground under it. It costs nothing to mount the world
                  it stands on first. */}
              <WorldColliders parts={snapshot.parts} />
              <PropColliders props={snapshot.props} />
              <RideKeyboard>
                <Bike spawn={snapshot.spawn} />
              </RideKeyboard>
            </>
          )}
        </Physics>

        {/* Last, so it reads the frame everything above it just drew. Costs a
            boolean check per frame when ?perf=1 is absent. */}
        <PerfProbe />
      </Canvas>

      <RaceHud code={code} />
      <PerfPanel />
      {snapshot && painted && touch && <RaceTouchControls />}

      {(!painted || !snapshot) && (
        <div className="bg-base absolute inset-0 flex flex-col items-center justify-center gap-4">
          <GameLoader
            label="Entering the circuit"
            /* Named, because this is the one loading screen where the wait can
               legitimately be long: a free-tier room server that has gone to
               sleep takes the better part of a minute to wake, and somebody
               staring at an unexplained thirty seconds assumes it is broken. */
            detail={`Room ${code} · waking the grid`}
          />
          <Link href="/race" className="hud-chip">
            Back
          </Link>
        </div>
      )}
    </div>
  );
}
