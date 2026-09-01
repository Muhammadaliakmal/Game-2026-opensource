"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE, FINISHES, type Shape } from "@/lib/worlddoc";
import { SHAPE_NAMES } from "./shapes";

/** DOM overlay, deliberately outside the Canvas — HTML is far cheaper than in-scene UI. */
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

  // historyTick and dirtyTick aren't rendered directly — subscribing to them is
  // what makes the part count and undo buttons refresh after an imperative edit.
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const historyTick = useEditorStore((s) => s.historyTick);
  void dirtyTick;
  void historyTick;

  const store = useEditorStore.getState();
  const count = store.parts.size;
  const canUndo = store.bus.canUndo;
  const canRedo = store.bus.canRedo;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
      {/* Top-left status, floated up out of the bottom bar. */}
      <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-3 rounded-lg bg-black/70 px-3 py-2 text-sm text-zinc-200 backdrop-blur">
        <input
          value={name}
          onChange={(e) => useEditorStore.getState().setName(e.target.value)}
          className="w-44 bg-transparent font-medium outline-none focus:underline"
          aria-label="World name"
        />
        <span
          className={count > 40000 ? "text-amber-400" : "text-zinc-400"}
          title="Parts placed (soft ceiling 50,000)"
        >
          {count.toLocaleString()} parts
        </span>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={play}
          disabled={saving || entering}
          className="rounded bg-emerald-600 px-3 py-1 font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          title="Save and walk around your world"
        >
          {entering ? "Entering…" : "Play"}
        </button>
        {lastSavedAt && !saving && (
          <span className="text-xs text-emerald-400">Saved</span>
        )}
      </div>

      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-xl bg-black/70 p-3 backdrop-blur">
        {/* Shapes */}
        <div className="flex gap-1">
          {SHAPE_NAMES.map((label, i) => (
            <button
              key={label}
              onClick={() => useEditorStore.getState().setShape(i as Shape)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                shape === i
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-zinc-300 hover:bg-white/20"
              }`}
              title={`${label} (${i + 1})`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mx-1 h-6 w-px bg-white/20" />

        {/* Finishes */}
        <div className="flex gap-1">
          {FINISHES.map((label, i) => (
            <button
              key={label}
              onClick={() => useEditorStore.getState().setFinish(i)}
              className={`rounded px-2.5 py-1.5 text-xs capitalize transition-colors ${
                finish === i
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-zinc-300 hover:bg-white/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mx-1 h-6 w-px bg-white/20" />

        <button
          onClick={() => useEditorStore.getState().rotateBrush()}
          className="rounded bg-white/10 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-white/20"
          title="Rotate (R)"
        >
          Rotate {rot * 90}°
        </button>
        <button
          onClick={() =>
            useEditorStore.getState().setTool(tool === "erase" ? "place" : "erase")
          }
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            tool === "erase"
              ? "bg-red-600 text-white"
              : "bg-white/10 text-zinc-300 hover:bg-white/20"
          }`}
          title="Toggle erase (E)"
        >
          {tool === "erase" ? "Erasing" : "Erase"}
        </button>

        <div className="mx-1 h-6 w-px bg-white/20" />

        <button
          onClick={() => useEditorStore.getState().undo()}
          disabled={!canUndo}
          className="rounded bg-white/10 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-white/20 disabled:opacity-40"
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          onClick={() => useEditorStore.getState().redo()}
          disabled={!canRedo}
          className="rounded bg-white/10 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-white/20 disabled:opacity-40"
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
      </div>

      {/* Palette */}
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap justify-center gap-1 rounded-xl bg-black/70 p-2 backdrop-blur">
        {PALETTE.map((hex, i) => (
          <button
            key={hex + i}
            onClick={() => useEditorStore.getState().setColorIndex(i)}
            style={{ background: hex }}
            className={`h-6 w-6 rounded transition-transform hover:scale-110 ${
              colorIndex === i ? "ring-2 ring-white ring-offset-1 ring-offset-black" : ""
            }`}
            aria-label={`Colour ${i}`}
          />
        ))}
      </div>
    </div>
  );
}
