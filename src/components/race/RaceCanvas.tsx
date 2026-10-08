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
import { isRaceHost } from "@/lib/race-host";
import type { CpuDifficulty } from "@/lib/race-cpu";
import { GameLoader } from "@/components/hud/GameLoader";
import { useRaceStore } from "@/stores/race-store";
import { playerFocus } from "@/components/play/camera-rig";
import { InstancedParts } from "@/components/editor/InstancedParts";
import { PlacedProps } from "@/components/editor/PlacedProps";
import { WorldColliders } from "@/components/play/WorldColliders";
import { PropColliders } from "@/components/play/PropColliders";
import { FollowSun } from "@/components/FollowSun";
import { FrameLimiter } from "@/components/FrameLimiter";
import { FirstFrame, useFirstPaint } from "@/components/FirstFrame";
import { BlockSurfaces } from "@/components/BlockSurfaces";
import { PostFX } from "@/components/PostFX";
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
import { RaceSounds } from "./RaceSounds";
import { ModeMusic } from "@/components/play/ModeMusic";
import { Ambient } from "@/components/play/Ambient";
import { RaceRiders } from "./RaceRiders";
import { RaceHud } from "./RaceHud";
import { RaceTouchControls } from "./RaceTouchControls";
import { RideKeyboard } from "./RideKeyboard";
import { useRenderQuality } from "@/lib/quality";
import { ContextGuard, ContextLostNotice } from "@/components/ContextGuard";

/**
 * The race canvas.
 *
 * The track arrives from the room as one
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
  track,
  cpu,
  bots,
}: {
  code: string;
  /**
   * The grid size the lobby asked for, when this client is the one opening the
   * room. Ignored by the server on a join — see joinRace.
   */
  target?: number;
  /**
   * The track the lobby chose, when this client opens the room. Ignored by the
   * server on a join — the joiner races whatever the creator built.
   */
  track?: string;
  /** CPU riders' difficulty, if this race has any. Heard only by the host. */
  cpu?: CpuDifficulty;
  /** CPU riders on the grid from the start: a race against the CPU. */
  bots?: number;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  // Cleared on the first frame that has the track in it, never on `onCreated`
  // -- see components/FirstFrame.tsx for the black screen that caused.
  const [painted, onPainted] = useFirstPaint();
  const touch = useCoarsePointer();
  const quality = useRenderQuality();
  // Read here as well as in the HUD: a connection that never happens must not
  // leave a spinner claiming to be joining.
  const error = useRaceStore((s) => s.error);
  const phase = useRaceStore((s) => s.phase);

  const onWorld = useCallback((doc: WorldDoc) => {
    // The track is read-only here, but it goes through the editor store:
    // InstancedParts renders from that store, and a second path into it would
    // be a second way for the two to disagree.
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
    // The browser that opened this race runs it (`lib/net/race.ts`).
    void joinRace(code, onWorld, { host: isRaceHost(code), target, track, cpu, bots }).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose?.();
      leaveRace();
    };
  }, [code, onWorld, target, track, cpu, bots]);

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
        // "percentage" = PCF, named outright. Bare `shadows` is PCFSoft, which three
        // r185 deprecates and swaps for PCF on the first shadow pass, after every
        // material had already compiled for PCFSoft: each shader compiled twice.
        shadows="percentage"
        camera={{
          position: [16, 16, 16],
          fov: 55,
          // Both were three.js defaults: near 0.1 and far 2000, a 20,000:1
          // ratio spent on a track whose whole bounding box is 260 units. Most
          // of the depth buffer's precision was going to the 20cm in front of
          // the lens where nothing is ever drawn, and the coplanar top faces of
          // 6,340 road blocks are exactly the geometry that shows it as
          // shimmer. Safe to pin here because every race track shares the
          // circuit's footprint — that same ~260-unit box, plus a few units of
          // elevation on Vapor Ridge; only the editor and Play canvases orbit
          // user-built worlds of unknown size and keep the defaults.
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
        }}
      >
        {/* First child, so the loop is running before anything below it has a
            frame to be rendered in. */}
        <FrameLimiter />
        <ContextGuard />

        {/* Night is the look. The sky owns the fill, the ambient, the fog and
            everything visible, so there is no second hemisphere light here —
            the neutral one that used to stand in would wash the black straight
            back out to grey.

            The sunset is still a complete, working sky and is what
            NEXT_PUBLIC_MAP_V2=1 selects. It is kept rather than deleted
            because nothing about it is wrong; it simply is not the direction
            this world is lit in. */}
        {MAP_V2 ? <SunsetSky /> : <NightSky />}

        {/* A wide shadow box: a bike covers ground fast enough that a tight
            one pops its edge in front of the rider.

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

        {/* groundY names the y=0 layer specifically, not "the ground": on both
            tracks that layer is the flat start straight and — on Vapor Ridge —
            the foot of every support column, all of it casting a shadow onto
            something coplanar or onto the underside of raised track. The raised
            surfaces themselves are y>0 and keep casting, so the ridge still
            throws a shadow across the infield. */}
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

        {/* Gated on the snapshot so the frame it reports is a frame with the
            track in it. Mounted with an empty scene it would report the first
            frame of that empty scene -- which is the black the cover is
            covering. */}
        {snapshot && <FirstFrame onPainted={onPainted} />}
        {/* The engine and the race's cues. Gated like FirstFrame: no bike, no engine. */}
        {snapshot && <RaceSounds />}

        <BlockSurfaces precompile adaptive />
        <PostFX />

        {/* Last, so it reads the frame everything above it just drew. Costs a
            boolean check per frame when ?perf=1 is absent. */}
        <PerfProbe />
      </Canvas>

      {/* Outside the canvas on purpose: when the context is gone, a DOM
          overlay is the only thing left that can be drawn. */}
      <ContextLostNotice />

      <RaceHud code={code} />
      <PerfPanel />
      {/* Every track is neon. Intensity follows the lights: up when racing. */}
      <Ambient mood="neon" intensity={phase === "racing" ? 1 : 0} />
      {/* Synthwave: four on the floor under a neon sky. */}
      <ModeMusic owner="race" style="synthwave" />
      {snapshot && painted && touch && <RaceTouchControls />}

      {(!painted || !snapshot) && (
        <div
          className="bg-base absolute inset-0 flex flex-col items-center justify-center gap-4"
          /*
           * The loading screen paints edge to edge — `viewportFit: "cover"`
           * (lib/immersive) puts it under the notch and under the phone's own
           * gesture bar. That is right for the world behind it and wrong for
           * anything you have to press: Back sat within a few pixels of the
           * Android navigation area, where a tap is as likely to go to the
           * system as to the page. So the content is held inside the safe area
           * plus the player's own frame, exactly as the HUD zones are.
           */
          style={{
            paddingTop:
              "calc(env(safe-area-inset-top, 0px) + var(--hud-inset, 0px) + var(--space-2))",
            paddingBottom:
              "calc(env(safe-area-inset-bottom, 0px) + var(--hud-inset, 0px) + var(--space-3))",
            paddingLeft:
              "calc(env(safe-area-inset-left, 0px) + var(--space-2))",
            paddingRight:
              "calc(env(safe-area-inset-right, 0px) + var(--space-2))",
          }}
        >
          <GameLoader
            tips="race"
            label="Entering the circuit"
            /* Named, because this is the one loading screen where the wait can
               legitimately be long: a free-tier room server that has gone to
               sleep takes the better part of a minute to wake, and somebody
               staring at an unexplained thirty seconds assumes it is broken. */
            detail={`Room ${code} · waking the grid`}
          />
          {/* A full touch target, not a 28px chip: this is the one control on
              the screen, and it is being pressed by somebody who has decided
              the wait is not worth it. */}
          <Link
            href="/race"
            className="hud-chip"
            style={{ minHeight: "var(--touch-sm)", paddingInline: "var(--space-2)" }}
          >
            Back
          </Link>
        </div>
      )}
    </div>
  );
}
