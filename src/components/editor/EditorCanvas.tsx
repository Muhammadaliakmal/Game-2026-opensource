"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useAuth } from "@clerk/nextjs";
import { useEditorStore } from "@/stores/editor-store";
import {
  clearDraft,
  DRAFT_ID,
  loadDraft,
  newDraftDoc,
  saveDraft,
} from "@/lib/draft";
import { parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";
import { InstancedParts } from "./InstancedParts";
import { GhostPreview } from "./GhostPreview";
import { SpawnMarker } from "./SpawnMarker";
import { Ground } from "./Ground";
import { Builder } from "./Builder";
import { Toolbar } from "./Toolbar";
import { useEditorHotkeys } from "./useEditorHotkeys";
import { FrameWorld } from "./FrameWorld";
import { FollowSun } from "@/components/FollowSun";

/** Keeps the key light's shadow camera centred on the orbit target. */
function EditorSun() {
  const controls = useThree((s) => s.controls) as unknown as {
    target?: THREE.Vector3;
  } | null;
  const origin = useMemo(() => new THREE.Vector3(), []);
  return <FollowSun extent={40} getFocus={() => controls?.target ?? origin} />;
}

export default function EditorCanvas({ worldId }: { worldId: string }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  /**
   * A draft has no database row: it lives in localStorage until someone signs
   * in and claims it. Everything below branches on this rather than on being
   * signed in, because a signed-in user can be working on a draft too (they
   * arrived before signing in, or opened the link directly).
   */
  const isDraft = worldId === DRAFT_ID;
  // A draft is already in this browser; there is nothing to wait for.
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() =>
    worldId === DRAFT_ID ? "ready" : "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Why this world cannot be saved, if it cannot. Drives the read-only banner. */
  const [lockedReason, setLockedReason] = useState<string | null>(null);

  // Load the world once on mount.
  useEffect(() => {
    let cancelled = false;

    if (isDraft) {
      // No round trip: pick up where they left off, or start from the
      // template. Never an empty grid. These write to the zustand store, not
      // to React state, so nothing cascades a render here.
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

        useEditorStore.getState().loadDoc(parseWorldDoc(row.doc));
        useEditorStore.getState().setReadOnly(Boolean(locked));
        setLockedReason(locked);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load this world.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worldId, isDraft]);

  /**
   * Persist a draft locally as it is built.
   *
   * This is the entire safety net for a build with no account behind it, so it
   * runs off the store subscription rather than off Save — the whole point is
   * that nobody has pressed Save. Debounced, because the subscription fires on
   * every painted cell and serialising a 7,000-part world per block would cost
   * more than the render does.
   */
  useEffect(() => {
    if (!isDraft || status !== "ready") return;

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
      // Catch whatever the last debounce did not: leaving the page is exactly
      // when an unsaved draft matters most.
      if (useEditorStore.getState().dirty) {
        saveDraft(useEditorStore.getState().toDoc(""));
      }
    };
  }, [isDraft, status]);

  /**
   * Turn the local draft into a world this account owns, then continue on its
   * real URL. Called the moment a signed-in visitor asks to keep their build.
   */
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
      // Only once the server has it: this is the only copy until then.
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

  /** Returns true only when the world actually reached the database. */
  const save = useCallback(async (): Promise<boolean> => {
    const s = useEditorStore.getState();
    if (s.readOnly || s.saving) return false;

    // A draft has nowhere to PUT to yet. Signed in, saving means claiming it;
    // signed out, the Toolbar puts a sign-in in front of this instead.
    if (isDraft) {
      if (!isSignedIn) return false;
      return claimDraft();
    }

    useEditorStore.setState({ saving: true });
    setSaveError(null);
    try {
      // ownerId is authoritative on the server; "" is a placeholder the API replaces.
      const doc: WorldDoc = s.toDoc("");
      const res = await fetch(`/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, doc }),
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

  /**
   * Called before jumping to Play. A draft is flushed to localStorage, which
   * is where Play will read it from; a real world has to reach the database,
   * and Play must not happen if it did not.
   */
  const prepareForPlay = useCallback(async (): Promise<boolean> => {
    const s = useEditorStore.getState();
    if (isDraft) {
      saveDraft(s.toDoc(""));
      return true;
    }
    if (s.readOnly) return true;
    return save();
  }, [isDraft, save]);

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

  useEditorHotkeys(save);

  // Last line of defence against losing a build to a stray Cmd+W or a back
  // gesture. The browser shows its own generic wording; the string is ignored.
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

  return (
    <div className="bg-steel-900 relative min-h-0 flex-1">
      <Canvas
        // "demand" means we only render when something actually changed —
        // an idle editor should not burn GPU at 60fps.
        frameloop="demand"
        shadows
        camera={{ position: [16, 16, 16], fov: 50 }}
        gl={{ powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onCreated={({ scene, gl }) => {
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
        {/* Follows whatever the camera is orbiting, so the shadow box is always
            over the part of the build you are working on. */}
        <EditorSun />

        <Builder>
          <Ground />
          <InstancedParts />
        </Builder>
        <GhostPreview />
        <SpawnMarker />
        <FrameWorld />

        <OrbitControls
          makeDefault
          // Left is reserved for building, so orbit moves to the right button.
          mouseButtons={{
            LEFT: undefined,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          // The same split for touch: one finger is the tool, two fingers are
          // the camera. A phone has no right button, so the default (one
          // finger orbits) meant every attempt to look around also painted
          // blocks — the editor was unusable on a touch screen.
          touches={{
            ONE: undefined,
            TWO: THREE.TOUCH.DOLLY_ROTATE,
          }}
          // Stop the camera dropping below the floor.
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={3}
          maxDistance={260}
          enableDamping
          dampingFactor={0.12}
        />
      </Canvas>

      {status === "loading" && (
        <div className="bg-steel-900/80 absolute inset-0 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
          <span className="border-signal h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="hud-label">Loading world</span>
        </div>
      )}

      <Toolbar
        worldId={worldId}
        onSave={save}
        onRemix={remix}
        lockedReason={lockedReason}
        saveError={saveError}
        onDismissSaveError={() => setSaveError(null)}
        isDraft={isDraft}
        isSignedIn={Boolean(isSignedIn)}
        onPlay={prepareForPlay}
      />
    </div>
  );
}
