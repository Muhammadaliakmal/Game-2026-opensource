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
 * viewports the tool cluster scrolls horizontally rather than stacking into a
 * tall wall that would eat the build view.
 */

const PANEL =
  "pointer-events-auto rounded-xl bg-zinc-950/80 ring-1 ring-white/10 backdrop-blur";
const BTN =
  "shrink-0 rounded-md px-2.5 py-1.5 text-xs sm:text-sm transition-colors";
const BTN_OFF = "bg-white/5 text-zinc-300 hover:bg-white/10";
const BTN_ON = "bg-blue-600 text-white";

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />;
}

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
      {/* ── Top row: identity on the left, primary actions on the right ── */}
      <div className="flex items-start justify-between gap-2">
        <div className={`${PANEL} flex min-w-0 items-center gap-2 px-2.5 py-1.5`}>
          <input
            value={name}
            onChange={(e) => useEditorStore.getState().setName(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none placeholder:text-zinc-500 focus:underline sm:w-48 sm:flex-none"
            aria-label="World name"
            placeholder="World name"
          />
          <span
            className={`hidden shrink-0 text-xs tabular-nums sm:inline ${
              count > 40000 ? "text-amber-400" : "text-zinc-500"
            }`}
            title="Parts placed (soft ceiling 50,000)"
          >
            {count.toLocaleString()}
          </span>
        </div>

        <div className={`${PANEL} flex shrink-0 items-center gap-1.5 px-2 py-1.5`}>
          <FullscreenButton
            className={`${BTN} hidden ${BTN_OFF} sm:block`}
          />
          <span
            className={`hidden text-xs sm:inline ${
              saving
                ? "text-amber-400"
                : lastSavedAt
                  ? "text-emerald-400"
                  : "text-transparent"
            }`}
          >
            {saving ? "Saving…" : "Saved"}
          </span>
          <button
            onClick={onSave}
            disabled={saving}
            className={`${BTN} bg-blue-600 font-medium text-white hover:bg-blue-500 disabled:opacity-50`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={play}
            disabled={saving || entering}
            className={`${BTN} bg-emerald-600 font-medium text-white hover:bg-emerald-500 disabled:opacity-50`}
            title="Save and walk around your world"
          >
            {entering ? "Entering…" : "Play"}
          </button>
        </div>
      </div>

      {/* ── Bottom stack: palette above the tool cluster ── */}
      <div className="flex flex-col items-center gap-2">
        <div
          className={`${PANEL} flex max-w-[min(94vw,44rem)] gap-1 overflow-x-auto p-1.5 sm:flex-wrap sm:justify-center sm:overflow-x-visible`}
        >
          {PALETTE.map((hex, i) => (
            <button
              key={hex + i}
              onClick={() => useEditorStore.getState().setColorIndex(i)}
              style={{ background: hex }}
              className={`h-6 w-6 shrink-0 rounded transition-transform hover:scale-110 sm:h-7 sm:w-7 ${
                colorIndex === i
                  ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-950"
                  : "ring-1 ring-white/10"
              }`}
              aria-label={`Colour ${i}`}
              aria-pressed={colorIndex === i}
            />
          ))}
        </div>

        <div
          className={`${PANEL} flex max-w-[calc(100vw-1rem)] items-center gap-1.5 overflow-x-auto p-1.5`}
        >
          <div className="flex shrink-0 items-center gap-1">
            {SHAPE_NAMES.map((label, i) => (
              <button
                key={label}
                onClick={() => useEditorStore.getState().setShape(i as Shape)}
                className={`${BTN} ${shape === i ? BTN_ON : BTN_OFF}`}
                title={`${label} (${i + 1})`}
              >
                {label}
              </button>
            ))}
          </div>

          <Divider />

          <div className="flex shrink-0 items-center gap-1">
            {FINISHES.map((label, i) => (
              <button
                key={label}
                onClick={() => useEditorStore.getState().setFinish(i)}
                className={`${BTN} capitalize ${finish === i ? BTN_ON : BTN_OFF}`}
                title={`${label} finish`}
              >
                {label}
              </button>
            ))}
          </div>

          <Divider />

          <button
            onClick={() => useEditorStore.getState().rotateBrush()}
            className={`${BTN} ${BTN_OFF}`}
            title="Rotate (R)"
          >
            Rotate {rot * 90}°
          </button>
          <button
            onClick={() =>
              useEditorStore
                .getState()
                .setTool(tool === "erase" ? "place" : "erase")
            }
            className={`${BTN} ${
              tool === "erase" ? "bg-red-600 text-white" : BTN_OFF
            }`}
            title="Toggle erase (E)"
          >
            {tool === "erase" ? "Erasing" : "Erase"}
          </button>

          <Divider />

          <button
            onClick={() => useEditorStore.getState().undo()}
            disabled={!canUndo}
            className={`${BTN} ${BTN_OFF} disabled:opacity-40`}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={() => useEditorStore.getState().redo()}
            disabled={!canRedo}
            className={`${BTN} ${BTN_OFF} disabled:opacity-40`}
            title="Redo (Ctrl+Y)"
          >
            Redo
          </button>
        </div>
      </div>
    </div>
  );
}
