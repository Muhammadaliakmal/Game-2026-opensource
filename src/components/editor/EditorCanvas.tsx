"use client";

import * as THREE from "three";
import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEditorStore } from "@/stores/editor-store";
import { parseWorldDoc, type WorldDoc } from "@/lib/worlddoc";
import { InstancedParts } from "./InstancedParts";
import { GhostPreview } from "./GhostPreview";
import { Ground } from "./Ground";
import { Builder } from "./Builder";
import { Toolbar } from "./Toolbar";
import { useEditorHotkeys } from "./useEditorHotkeys";

export default function EditorCanvas({ worldId }: { worldId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  // Load the world once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/worlds/${worldId}`);
        if (!res.ok) throw new Error(`Failed to load world (${res.status})`);
        const row = await res.json();
        if (cancelled) return;
        useEditorStore.getState().loadDoc(parseWorldDoc(row.doc));
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

  const save = useCallback(async () => {
    const s = useEditorStore.getState();
    if (s.saving) return;
    useEditorStore.setState({ saving: true });
    try {
      // ownerId is authoritative on the server; "" is a placeholder the API replaces.
      const doc: WorldDoc = s.toDoc("");
      const res = await fetch(`/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, doc }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      useEditorStore.setState({ lastSavedAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      useEditorStore.setState({ saving: false });
    }
  }, [worldId]);

  useEditorHotkeys(save);

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 p-8 text-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="relative flex-1 bg-zinc-950">
      <Canvas
        // "demand" means we only render when something actually changed —
        // an idle editor should not burn GPU at 60fps.
        frameloop="demand"
        shadows
        camera={{ position: [16, 16, 16], fov: 50 }}
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
        />

        <Builder>
          <Ground />
          <InstancedParts />
        </Builder>
        <GhostPreview />

        <OrbitControls
          makeDefault
          // Left is reserved for building, so orbit moves to the right button.
          mouseButtons={{
            LEFT: undefined,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          // Stop the camera dropping below the floor.
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={3}
          maxDistance={80}
          enableDamping
          dampingFactor={0.12}
        />
      </Canvas>

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-zinc-950/70 text-sm text-zinc-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
          Loading world…
        </div>
      )}

      <Toolbar worldId={worldId} onSave={save} />
    </div>
  );
}
