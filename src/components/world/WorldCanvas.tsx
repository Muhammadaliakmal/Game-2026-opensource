"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { KeyboardControls, OrbitControls } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";

import { useEditorStore } from "@/stores/editor-store";
import { parseWorldDoc, type PartTuple, type PropInstance, type WorldDoc } from "@/lib/worlddoc";
import {
  clearDraft,
  DRAFT_ID,
  loadDraft,
  newDraftDoc,
  saveDraft,
} from "@/lib/draft";
import { captureThumbnail } from "@/lib/canvas-thumbnail";
import { connectToWorld, multiplayerEnabled, setPresenceMode } from "@/lib/net/room";

import { InstancedParts } from "@/components/editor/InstancedParts";
import { GhostPreview } from "@/components/editor/GhostPreview";
import { SpawnMarker } from "@/components/editor/SpawnMarker";
import { Ground } from "@/components/editor/Ground";
import { Builder } from "@/components/editor/Builder";
import { Toolbar } from "@/components/editor/Toolbar";
import { FrameWorld } from "@/components/editor/FrameWorld";
import { useEditorHotkeys } from "@/components/editor/useEditorHotkeys";
import { PlacedProps } from "@/components/editor/PlacedProps";
import { PropGizmo } from "@/components/editor/PropGizmo";

import { WorldColliders } from "@/components/play/WorldColliders";
import { PropColliders } from "@/components/play/PropColliders";
import { Player } from "@/components/play/Player";
import { Peers } from "@/components/play/Peers";
import { GoalZone } from "@/components/play/GoalZone";
import { TouchControls } from "@/components/play/TouchControls";
import { useTouchControls } from "@/lib/use-media-query";
import { cameraHandoff, playerFocus } from "@/components/play/camera-rig";
import { PlayHud } from "./PlayHud";
import { FollowSun } from "@/components/FollowSun";
import { keyboardMap } from "@/components/play/controls";

/**
 * Build and Play, on one canvas.
 *
 * They used to be two routes with two <Canvas> trees, so switching meant a
 * page navigation: the WebGL context was torn down and rebuilt, the world was
 * re-fetched, and the camera cut. UI spec §3.3 asks for the opposite — pressing
 * Play should feel like stepping into the world you are looking at, not like
 * loading a page.
 *
 * So this is one canvas with a mode. What changes between them:
 *
 *  - `frameloop`. Building renders on demand, because an idle editor has no
 *    business burning a GPU; playing needs every frame for physics.
 *  - Who owns the camera. OrbitControls in Build, the follow rig in Play, and
 *    never both — hence the hard unmount rather than a disabled flag.
 *  - Physics stays MOUNTED and paused while building, rather than being torn
 *    down and rebuilt on every toggle. SPEC §1 forbids running physics during
 *    editing, and a paused world does not step.
 *
 * What does NOT change is the renderer: both modes draw the world from
 * InstancedParts off the editor store, so toggling cannot flash or disagree
 * with itself, and there is exactly one source of truth for what the world is.
 *
 * The routes still exist and still mean something — /play/<id> is the share
 * link — but the toggle inside is a mode change, not a navigation.
 */

export type Mode = "build" | "play";

/** A frozen copy of a world, handed to physics. */
interface Snapshot {
  parts: PartTuple[];
  props: PropInstance[];
  spawn: [number, number, number];
  /** Undefined unless this world is a course — see WorldDoc.goal. */
  goal?: [number, number, number];
}

function toSnapshot(doc: WorldDoc): Snapshot {
  return {
    parts: doc.parts,
    props: doc.props,
    spawn: [doc.spawn[0], doc.spawn[1], doc.spawn[2]],
    goal: doc.goal ? [doc.goal[0], doc.goal[1], doc.goal[2]] : undefined,
  };
}

// Live game-feel tuning panel — dev only. `dynamic` keeps leva out of the main
// bundle; the DEV gate keeps it from ever rendering in a production build.
const DEV = process.env.NODE_ENV !== "production";
const FeelTuner = dynamic(() => import("@/components/play/feel/FeelTuner"), {
  ssr: false,
});

/**
 * Build mode's props layer, isolated in its own component so a PivotControls
 * drag (which updates the store every frame) re-renders only this leaf
 * rather than the whole WorldCanvas tree.
 */
function LivePlacedProps() {
  const props = useEditorStore((s) => s.props);
  const selectedProp = useEditorStore((s) => s.selectedProp);
  return (
    <>
      <PlacedProps props={props} exclude={selectedProp} interactive />
      <PropGizmo />
    </>
  );
}

/**
 * Fires once, on the first rendered frame. Standing up Rapier and thousands of
 * instances takes noticeably longer than the fetch on a phone — long enough
 * that the loading cover used to clear onto an unpainted canvas.
 */
function FirstFrame({ onPainted }: { onPainted: () => void }) {
  useFrame(() => onPainted());
  return null;
}

/** Keeps the key light's shadow camera over whatever is being looked at. */
function Sun({ mode }: { mode: Mode }) {
  const controls = useThree((s) => s.controls) as unknown as {
    target?: THREE.Vector3;
  } | null;
  const origin = useMemo(() => new THREE.Vector3(), []);

  return (
    <FollowSun
      extent={mode === "play" ? 34 : 40}
      getFocus={() =>
        mode === "play" ? playerFocus : (controls?.target ?? origin)
      }
    />
  );
}

/**
 * Hands the camera from the orbit view to the follow rig.
 *
 * Reads the pose the editor camera is in at the instant Play begins and parks
 * it where the rig will pick it up. The rig then eases to the character on its
 * normal camera lag rather than cutting, which is what makes the transition
 * read as stepping into the scene.
 */
function CameraHandoff({ mode }: { mode: Mode }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target?: THREE.Vector3;
  } | null;

  const previous = useRef<Mode>(mode);
  useEffect(() => {
    if (previous.current === "build" && mode === "play") {
      const target = controls?.target;
      cameraHandoff.from.copy(target ?? camera.position);
      cameraHandoff.distance = target
        ? Math.max(2, camera.position.distanceTo(target))
        : 9;
      cameraHandoff.pending = true;
    }
    previous.current = mode;
  }, [mode, camera, controls]);

  return null;
}

export default function WorldCanvas({
  worldId,
  initialMode,
}: {
  worldId: string;
  initialMode: Mode;
}) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const touch = useTouchControls();

  const isDraft = worldId === DRAFT_ID;
  const [mode, setMode] = useState<Mode>(initialMode);

  // A draft is already in this browser; there is nothing to wait for.
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() =>
    worldId === DRAFT_ID ? "ready" : "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(isDraft);
  const [painted, setPainted] = useState(false);

  /**
   * The world Rapier is standing on. Snapshotted at the moment Play begins
   * rather than read live: colliders are expensive to rebuild, and the store
   * must not be able to change the ground out from under a character mid-jump.
   *
   * Taken in the three places play can start — a draft opened straight at
   * /play/new (here), a stored world finishing its load, and the Play button —
   * rather than in an effect watching `mode`, which would be a synchronous
   * setState in an effect body.
   */
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    initialMode === "play" && worldId === DRAFT_ID
      ? toSnapshot(loadDraft() ?? newDraftDoc())
      : null
  );

  const name = useEditorStore((s) => s.name);

  // Stashed from the Canvas's onCreated rather than read via useThree: save()
  // runs in this outer component, outside the R3F tree that hook needs.
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // Drop the loading cover once the scene has painted, or after a hard
  // timeout, so a device that never gets a WebGL context is not stranded.
  useEffect(() => {
    if (painted) return;
    const t = setTimeout(() => setPainted(true), 8000);
    return () => clearTimeout(t);
  }, [painted]);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (isDraft) {
      useEditorStore.getState().loadDoc(loadDraft() ?? newDraftDoc());
      useEditorStore.getState().setReadOnly(false);
      return;
    }

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
        if (cancelled) return;

        // Work out up front whether Save can ever succeed. Finding out at the
        // first Ctrl+S — after twenty minutes of building — is the worst
        // possible moment to learn a world is read-only.
        const locked = row.builtIn
          ? "Built-in world — make a copy to edit it."
          : row.isOwner === false
            ? "This world belongs to someone else."
            : null;

        const doc = parseWorldDoc(row.doc);
        useEditorStore.getState().loadDoc(doc);
        useEditorStore.getState().setReadOnly(Boolean(locked));
        // Arriving straight at a play link: stand the world up as soon as it
        // is here, without waiting for a mode change that already happened.
        if (initialMode === "play") setSnapshot(toSnapshot(doc));
        setLockedReason(locked);
        setCanEdit(!locked);
        setStatus("ready");

        // Fire-and-forget: a lost play count is never worth interrupting
        // someone's game over, and the server skips the owner's own replays.
        if (initialMode === "play") {
          void fetch(`/api/worlds/${worldId}/play`, { method: "POST" }).catch(
            () => {}
          );
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load this world.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [worldId, isDraft, initialMode]);

  /**
   * Join the room for this world, once it has loaded.
   *
   * Deliberately after the load rather than alongside it: the room replies
   * with its own authoritative snapshot, and arriving second means it
   * overwrites the API copy rather than racing it. A draft has no room — it
   * exists only in this browser and has no id anyone else could join.
   */
  useEffect(() => {
    if (!multiplayerEnabled || isDraft || status !== "ready") return;

    let dispose: (() => void) | undefined;
    let cancelled = false;
    void connectToWorld(worldId).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [worldId, isDraft, status]);

  /** Peers need to know which mode we are in — see Peers.tsx. */
  useEffect(() => {
    if (multiplayerEnabled) setPresenceMode(mode === "build");
  }, [mode]);

  /** Persist a draft locally as it is built — the only copy it has. */
  useEffect(() => {
    if (!isDraft || status !== "ready" || mode !== "build") return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useEditorStore.subscribe(() => {
      if (!useEditorStore.getState().dirty) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        saveDraft(useEditorStore.getState().toDoc(""));
      }, 800);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
      if (useEditorStore.getState().dirty) {
        saveDraft(useEditorStore.getState().toDoc(""));
      }
    };
  }, [isDraft, status, mode]);

  // ── Save ────────────────────────────────────────────────────────────────
  const claimDraft = useCallback(async (): Promise<boolean> => {
    const s = useEditorStore.getState();
    if (s.saving) return false;

    useEditorStore.setState({ saving: true });
    setSaveError(null);
    try {
      const res = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: s.toDoc(""), name: s.name }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Sign in to keep this world."
            : `Could not save this world (${res.status}).`
        );
      }
      const row = await res.json();
      useEditorStore.getState().markSaved();
      clearDraft();
      router.replace(`/build/${row.id}`);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      useEditorStore.setState({ saving: false });
    }
  }, [router]);

  const save = useCallback(async (): Promise<boolean> => {
    const s = useEditorStore.getState();
    if (s.readOnly || s.saving) return false;

    if (isDraft) {
      if (!isSignedIn) return false;
      return claimDraft();
    }

    useEditorStore.setState({ saving: true });
    setSaveError(null);
    try {
      // ownerId is authoritative on the server; "" is a placeholder it replaces.
      const doc: WorldDoc = s.toDoc("");
      // Only from the build camera, never Play's — this always runs before
      // enterPlay() flips `mode`, so the canvas is still showing the build
      // view whichever caller triggered this save.
      const thumbnail = glRef.current
        ? captureThumbnail(glRef.current.domElement)
        : null;
      const res = await fetch(`/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, doc, thumbnail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ??
            (res.status === 401
              ? "You are signed out — sign in again to save."
              : `Save failed (${res.status}).`)
        );
      }
      useEditorStore.getState().markSaved();
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
      return false;
    } finally {
      useEditorStore.setState({ saving: false });
    }
  }, [worldId, isDraft, isSignedIn, claimDraft]);

  /** Copy this world into one the player owns, and open that. */
  const remix = useCallback(async () => {
    const res = await fetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: worldId }),
    });
    if (!res.ok) {
      setSaveError(
        res.status === 401
          ? "Sign in to make your own copy."
          : `Could not make a copy (${res.status}).`
      );
      return;
    }
    const row = await res.json();
    router.push(`/build/${row.id}`);
  }, [worldId, router]);

  // ── Mode ────────────────────────────────────────────────────────────────
  /**
   * Enter Play. A draft is flushed to this browser first; a real world has to
   * reach the database, because Play reads the world back and unsaved edits
   * would be lost. The URL is corrected in place — a mode change is not a
   * navigation, but a refresh should still land where you were.
   */
  const enterPlay = useCallback(async (): Promise<boolean> => {
    const s = useEditorStore.getState();
    if (isDraft) {
      saveDraft(s.toDoc(""));
    } else if (!s.readOnly && s.dirty && (await save()) === false) {
      return false;
    }
    setSnapshot(toSnapshot(s.toDoc("")));
    setMode("play");
    window.history.replaceState(null, "", `/play/${worldId}`);
    return true;
  }, [isDraft, save, worldId]);

  const enterBuild = useCallback(() => {
    if (!canEdit && !isDraft) return;
    setMode("build");
    window.history.replaceState(null, "", `/build/${worldId}`);
  }, [canEdit, isDraft, worldId]);

  useEditorHotkeys(mode === "build" ? save : undefined);

  // Esc leaves Play. Bound here rather than in the HUD so it works whether or
  // not the pointer has ever entered the canvas.
  useEffect(() => {
    if (mode !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      enterBuild();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, enterBuild]);

  // Last line of defence against losing a build to a stray Cmd+W.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useEditorStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (status === "error") {
    return (
      <div className="bg-steel-900 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-danger max-w-sm text-sm font-semibold">{error}</p>
        <div className="flex gap-2">
          <Link href="/" className="hud-chip hud-chip--primary">
            Your worlds
          </Link>
          <Link href="/browse" className="hud-chip">
            Browse worlds
          </Link>
        </div>
      </div>
    );
  }

  const playing = mode === "play";

  return (
    <div className="bg-steel-900 relative min-h-0 flex-1">
      <Canvas
        // Building renders on demand — an idle editor should not burn a GPU.
        // Playing needs every frame.
        frameloop={playing ? "always" : "demand"}
        shadows
        camera={{ position: [16, 16, 16], fov: 50 }}
        // `powerPreference` is deliberately left at the default: pairing
        // "high-performance" with preserveDrawingBuffer makes some Android
        // GPUs hand back a context that never paints, and a phone has only the
        // one GPU to pick anyway.
        gl={{ preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false }}
        onCreated={({ scene, gl }) => {
          glRef.current = gl;
          scene.background = new THREE.Color("#14171a");
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
        <hemisphereLight args={["#c8d2dd", "#1a1d21", 1.15]} />
        <Sun mode={mode} />
        <CameraHandoff mode={mode} />
        {!painted && <FirstFrame onPainted={() => setPainted(true)} />}

        {/* One renderer for both modes: the world can never flash or disagree
            with itself on the way through the transition. */}
        <InstancedParts />
        {/* Play mode's read-only view of the same props Build edits live —
            colliders for these are the PropColliders inside <Physics> below. */}
        {playing && snapshot && <PlacedProps props={snapshot.props} />}
        {/* Peers are drawn in Play only: Build renders on demand, and an
            avatar that moves between frames nobody asked for would either
            stutter or force the editor to render continuously. */}
        {playing && <Peers />}
        {/* Only for a world that is a course. Outside <Physics> because the
            finish is a trigger volume we test ourselves, not a collider —
            giving it a real sensor would mean a rigid body that the character
            can be pushed off by. */}
        {playing && snapshot?.goal && (
          <GoalZone goal={snapshot.goal} worldId={worldId} />
        )}

        {!playing && (
          <>
            <Builder>
              <Ground />
              {/* Inside Builder's group so a click on an existing prop can
                  stopPropagation() and pre-empt a new placement behind it
                  (see PlacedProps' onPointerDown and Builder's own "prop"
                  branch) — the same bubbling relationship Ground relies on
                  for erase/paint/pick. */}
              <LivePlacedProps />
            </Builder>
            <GhostPreview />
            <SpawnMarker />
            <FrameWorld />
            <OrbitControls
              makeDefault
              // Left is reserved for building, so orbit moves to the right
              // button; one finger is the tool and two are the camera.
              mouseButtons={{
                LEFT: undefined,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
              }}
              touches={{ ONE: undefined, TWO: THREE.TOUCH.DOLLY_ROTATE }}
              maxPolarAngle={Math.PI / 2 - 0.02}
              minDistance={3}
              // Far enough out to frame the whole build plane, which is now
              // 384 units across — capping short of it means the corners of
              // your own world are somewhere you cannot pull back to see.
              maxDistance={520}
              enableDamping
              dampingFactor={0.12}
            />
          </>
        )}

        {/*
          Mounted in both modes and paused while building, rather than torn
          down and rebuilt on every toggle. A paused world does not step, so
          SPEC §1's "no physics while editing" still holds.

          Fixed timestep, not "vary": ecctrl holds the character on a spring
          and integrates it as force * timestep, tuned for ~1/60. On a slow
          device "vary" feeds it 50-200ms deltas, the spring overshoots, and
          the character gets flung into the air.
        */}
        <Physics timeStep={1 / 60} paused={!playing}>
          {playing && snapshot && (
            <>
              <KeyboardControls map={keyboardMap}>
                <Player spawn={snapshot.spawn} />
              </KeyboardControls>
              <WorldColliders parts={snapshot.parts} />
              <PropColliders props={snapshot.props} />

              {/* Safety pad for an empty world only: without ground under the
                  spawn a blank world is an endless fall/respawn loop, but in a
                  built world a pad would sit inside the geometry. */}
              {snapshot.parts.length === 0 && (
                <RigidBody
                  type="fixed"
                  colliders="cuboid"
                  position={[
                    snapshot.spawn[0],
                    snapshot.spawn[1] - 1.5,
                    snapshot.spawn[2],
                  ]}
                >
                  <mesh scale={[8, 1, 8]} receiveShadow>
                    <boxGeometry />
                    <meshStandardMaterial
                      color="#2b3037"
                      roughness={0.85}
                      emissive="#ffb020"
                      emissiveIntensity={0.04}
                    />
                  </mesh>
                </RigidBody>
              )}
            </>
          )}
        </Physics>
      </Canvas>

      {/* Chrome. The incoming set fades in; the outgoing one unmounts, because
          a Toolbar left mounted during Play would still be listening for B, E
          and G. */}
      {playing ? (
        <div className="panel-enter absolute inset-0">
          <PlayHud
            name={name}
            canEdit={canEdit || isDraft}
            worldId={worldId}
            isDraft={isDraft}
            onEdit={enterBuild}
            showKeyboardLegend={!touch}
          />
        </div>
      ) : (
        <div className="panel-enter absolute inset-0">
          <Toolbar
            onSave={save}
            onRemix={remix}
            onPlay={enterPlay}
            lockedReason={lockedReason}
            saveError={saveError}
            onDismissSaveError={() => setSaveError(null)}
            isDraft={isDraft}
            isSignedIn={Boolean(isSignedIn)}
          />
        </div>
      )}

      {playing && status === "ready" && painted && touch && <TouchControls />}

      {(status === "loading" || !painted) && (
        <div className="bg-steel-900 absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
          <span className="border-signal h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="hud-label">Loading world</span>
        </div>
      )}

      {DEV && playing && <FeelTuner />}
    </div>
  );
}
