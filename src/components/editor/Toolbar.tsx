"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE, FINISHES, type Shape } from "@/lib/worlddoc";
import { SHAPE_NAMES } from "./shapes";
import { FullscreenButton } from "@/components/FullscreenButton";

/**
 * DOM overlay, deliberately outside the Canvas — HTML is far cheaper than
 * in-scene UI, and it can be made responsive with plain CSS.
 *
 * Layout: the outer layer is `pointer-events-none` so clicks fall through to
 * the canvas; each panel re-enables pointer events for itself. On narrow
 * viewports the clusters scroll horizontally rather than stacking into a tall
 * wall that would eat the build view.
 *
 * Styling comes from the `.hud-*` primitives in globals.css — see the
 * "Neon Voxel" Figma file for the source design.
 */
export function Toolbar({
  worldId,
  onSave,
}: {
  worldId: string;
  onSave: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [entering, setEntering] = useState(false);

  // Play loads the world from the DB, so unsaved edits would vanish on the jump.
  // Save first, then navigate.
  async function play() {
    setEntering(true);
    try {
      await onSave();
      router.push(`/play/${worldId}`);
    } finally {
      setEntering(false);
    }
  }

  const shape = useEditorStore((s) => s.shape);
  const colorIndex = useEditorStore((s) => s.colorIndex);
  const finish = useEditorStore((s) => s.finish);
  const rot = useEditorStore((s) => s.rot);
  const tool = useEditorStore((s) => s.tool);
  const name = useEditorStore((s) => s.name);
  const saving = useEditorStore((s) => s.saving);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);

  // historyTick / dirtyTick aren't rendered directly — subscribing is what makes
  // the part count and undo buttons refresh after an imperative edit.
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const historyTick = useEditorStore((s) => s.historyTick);
  void dirtyTick;
  void historyTick;

  const store = useEditorStore.getState();
  const count = store.parts.size;
  const canUndo = store.bus.canUndo;
  const canRedo = store.bus.canRedo;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-2 sm:p-3">
      {/* ── Top row: identity left, primary actions right ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="hud-panel pointer-events-auto flex min-w-0 items-center gap-3 px-3 py-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              saving
                ? "bg-gold shadow-[0_0_10px_var(--color-gold)]"
                : "bg-mint shadow-[0_0_10px_var(--color-mint)]"
            }`}
            title={saving ? "Saving" : lastSavedAt ? "Saved" : "Unsaved"}
          />
          <input
            value={name}
            onChange={(e) => useEditorStore.getState().setName(e.target.value)}
            className="text-ink placeholder:text-dim min-w-0 flex-1 bg-transparent text-sm font-bold outline-none sm:w-44 sm:flex-none"
            aria-label="World name"
            placeholder="World name"
          />
          <span
            className={`hud-label hidden shrink-0 tabular-nums sm:inline ${
              count > 40000 ? "text-gold" : ""
            }`}
            title="Parts placed (soft ceiling 50,000)"
          >
            {count.toLocaleString()} parts
          </span>
        </div>

        <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1.5 p-1.5">
          <FullscreenButton className="hud-chip hidden sm:inline-flex" />
          <button
            onClick={onSave}
            disabled={saving}
            className="hud-chip hud-chip--neon"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={play}
            disabled={saving || entering}
            className="hud-chip hud-chip--mint"
            title="Save and walk around your world"
          >
            {entering ? "Entering…" : "▶ Play"}
          </button>
        </div>
      </div>

      {/* ── Bottom dock: palette over the tool cluster ── */}
      <div className="flex flex-col items-center gap-2">
        <div className="hud-panel hud-scroll pointer-events-auto flex max-w-[min(94vw,44rem)] gap-1.5 overflow-x-auto p-2 sm:flex-wrap sm:justify-center">
          {PALETTE.map((hex, i) => (
            <button
              key={hex + i}
              onClick={() => useEditorStore.getState().setColorIndex(i)}
              style={{
                background: hex,
                boxShadow: colorIndex === i ? `0 0 16px -2px ${hex}` : undefined,
              }}
              className={`h-7 w-7 shrink-0 rounded-lg transition-transform hover:scale-110 ${
                colorIndex === i
                  ? "ring-ink ring-offset-panel scale-110 ring-2 ring-offset-2"
                  : "ring-1 ring-white/10"
              }`}
              aria-label={`Colour ${i}`}
              aria-pressed={colorIndex === i}
            />
          ))}
        </div>

        <div className="hud-panel hud-scroll pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-1.5 p-2">
          {SHAPE_NAMES.map((label, i) => (
            <button
              key={label}
              onClick={() => useEditorStore.getState().setShape(i as Shape)}
              className={`hud-chip ${shape === i ? "hud-chip--neon" : ""}`}
              title={`${label} (${i + 1})`}
            >
              {label}
            </button>
          ))}

          <span className="hud-divider" />

          {FINISHES.map((label, i) => (
            <button
              key={label}
              onClick={() => useEditorStore.getState().setFinish(i)}
              className={`hud-chip ${finish === i ? "hud-chip--plasma" : ""}`}
              title={`${label} finish`}
            >
              {label}
            </button>
          ))}

          <span className="hud-divider" />

          <button
            onClick={() => useEditorStore.getState().rotateBrush()}
            className="hud-chip"
            title="Rotate (R)"
          >
            ⟳ {rot * 90}°
          </button>
          <button
            onClick={() =>
              useEditorStore
                .getState()
                .setTool(tool === "erase" ? "place" : "erase")
            }
            className={`hud-chip ${tool === "erase" ? "hud-chip--flare" : ""}`}
            title="Toggle erase (E)"
          >
            {tool === "erase" ? "Erasing" : "Erase"}
          </button>

          <span className="hud-divider" />

          <button
            onClick={() => useEditorStore.getState().undo()}
            disabled={!canUndo}
            className="hud-chip"
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={() => useEditorStore.getState().redo()}
            disabled={!canRedo}
            className="hud-chip"
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>
        </div>
      </div>
    </div>
  );
}
