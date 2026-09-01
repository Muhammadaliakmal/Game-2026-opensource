"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditorStore } from "@/stores/editor-store";
import { PALETTE, FINISHES, type Shape } from "@/lib/worlddoc";
import { SHAPE_NAMES } from "./shapes";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";

/**
 * DOM overlay, deliberately outside the Canvas — HTML is far cheaper than
 * in-scene UI, and it can be made responsive with plain CSS.
 *
 * Layout: the outer layer is `pointer-events-none` so clicks fall through to
 * the canvas; each panel re-enables pointer events for itself. On narrow
 * viewports the clusters scroll horizontally rather than stacking into a tall
 * wall that would eat the build view.
 *
 * Styling comes from the `.hud-*` primitives in globals.css.
 */

const HELP_SEEN_KEY = "blockworld:editor-help-seen";

const CONTROLS: Array<[string, string]> = [
  ["Left drag", "place or erase blocks"],
  ["Right drag", "orbit the camera"],
  ["Middle drag", "pan"],
  ["Scroll", "zoom"],
  ["1 – 4", "pick a shape"],
  ["R", "rotate the brush"],
  ["E", "toggle erase"],
  ["G", "move the spawn point"],
  ["Ctrl + Z / Y", "undo / redo"],
  ["Ctrl + S", "save"],
  ["?", "show or hide this list"],
];

/** The keyboard/mouse legend. Shown automatically the first time only. */
function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="hud-panel pointer-events-auto w-[min(92vw,22rem)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="hud-label text-neon">Controls</span>
        <button onClick={onClose} className="hud-chip" aria-label="Close controls">
          Close
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {CONTROLS.map(([key, what]) => (
          <div key={key} className="contents">
            <dt className="bg-raised text-ink justify-self-start rounded-md px-1.5 py-0.5 font-mono text-[0.625rem] font-bold ring-1 ring-white/10">
              {key}
            </dt>
            <dd className="text-muted text-xs">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Toolbar({
  worldId,
  onSave,
  onRemix,
  lockedReason,
  saveError,
  onDismissSaveError,
}: {
  worldId: string;
  onSave: () => Promise<boolean>;
  onRemix: () => void | Promise<void>;
  lockedReason: string | null;
  saveError: string | null;
  onDismissSaveError: () => void;
}) {
  const router = useRouter();
  const [entering, setEntering] = useState(false);
  const [remixing, setRemixing] = useState(false);
  // Read on first render, not in an effect: this component only ever renders
  // in the browser (EditorCanvas is a dynamic ssr:false import), so there is no
  // server render to mismatch, and a setState-in-effect would cascade a render.
  const [help, setHelp] = useState(() => {
    try {
      return !window.localStorage.getItem(HELP_SEEN_KEY);
    } catch {
      // Private mode: skip the first-run hint rather than showing it forever.
      return false;
    }
  });

  const shape = useEditorStore((s) => s.shape);
  const colorIndex = useEditorStore((s) => s.colorIndex);
  const finish = useEditorStore((s) => s.finish);
  const rot = useEditorStore((s) => s.rot);
  const tool = useEditorStore((s) => s.tool);
  const name = useEditorStore((s) => s.name);
  const saving = useEditorStore((s) => s.saving);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const readOnly = useEditorStore((s) => s.readOnly);

  // historyTick / dirtyTick are not rendered directly — subscribing is what
  // makes the part count and undo buttons refresh after an imperative edit.
  const dirtyTick = useEditorStore((s) => s.dirtyTick);
  const historyTick = useEditorStore((s) => s.historyTick);
  void dirtyTick;
  void historyTick;

  const store = useEditorStore.getState();
  const count = store.parts.size;
  const canUndo = store.bus.canUndo;
  const canRedo = store.bus.canRedo;

  // The legend opens unprompted on someone's first visit, then never again.
  // A first-run editor with no visible instructions is the most common way a
  // builder bounces: left-click-to-build and right-drag-to-orbit are not
  // guessable.
  useEffect(() => {
    if (!help) return;
    try {
      window.localStorage.setItem(HELP_SEEN_KEY, "1");
    } catch {
      /* preference just will not persist */
    }
  }, [help]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) setHelp((v) => !v);
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Play reads the world back from the database, so unsaved edits would vanish
   * on the jump — save first, and do NOT navigate if that save failed. (This
   * used to push to /play regardless, which quietly threw the work away.)
   */
  async function play() {
    setEntering(true);
    try {
      if (!readOnly && (await onSave()) === false) return;
      router.push(`/play/${worldId}`);
    } finally {
      setEntering(false);
    }
  }

  async function remix() {
    setRemixing(true);
    try {
      await onRemix();
    } finally {
      setRemixing(false);
    }
  }

  // What the status dot means, in one place.
  const statusLabel = saving
    ? "Saving…"
    : readOnly
      ? "Read-only"
      : dirty
        ? "Unsaved changes"
        : lastSavedAt
          ? "Saved"
          : "No changes yet";
  const statusColor = saving
    ? "bg-gold shadow-[0_0_10px_var(--color-gold)]"
    : readOnly
      ? "bg-dim"
      : dirty
        ? "bg-gold shadow-[0_0_10px_var(--color-gold)]"
        : "bg-mint shadow-[0_0_10px_var(--color-mint)]";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-2 sm:p-3">
      {/* ── Top row: identity left, primary actions right ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="hud-panel pointer-events-auto flex min-w-0 items-center gap-3 px-3 py-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`}
              title={statusLabel}
            />
            <input
              value={name}
              onChange={(e) => useEditorStore.getState().setName(e.target.value)}
              disabled={readOnly}
              className="text-ink placeholder:text-dim min-w-0 flex-1 bg-transparent text-sm font-bold outline-none disabled:opacity-70 sm:w-44 sm:flex-none"
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

          {/* Say a world is read-only BEFORE the work happens, and offer the
              one action that does work: copy it. */}
          {lockedReason && (
            <div className="hud-panel pointer-events-auto flex max-w-[min(92vw,28rem)] flex-wrap items-center gap-2 px-3 py-2">
              <span className="text-gold text-xs font-semibold">
                {lockedReason}
              </span>
              <button
                onClick={remix}
                disabled={remixing}
                className="hud-chip hud-chip--neon"
              >
                {remixing ? "Copying…" : "⎘ Make my copy"}
              </button>
            </div>
          )}

          {saveError && (
            <div className="hud-panel pointer-events-auto flex max-w-[min(92vw,28rem)] items-center gap-2 px-3 py-2">
              <span className="text-flare text-xs font-semibold">{saveError}</span>
              <button onClick={onDismissSaveError} className="hud-chip">
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1.5 p-1.5">
          <Link href="/" className="hud-chip hidden sm:inline-flex" title="Your worlds">
            ◂ Worlds
          </Link>
          <MuteButton className="hud-chip" />
          <FullscreenButton className="hud-chip hidden sm:inline-flex" />
          <button
            onClick={() => setHelp((v) => !v)}
            className={`hud-chip ${help ? "hud-chip--neon" : ""}`}
            title="Controls (?)"
            aria-label="Show controls"
            aria-pressed={help}
          >
            ?
          </button>
          <button
            onClick={onSave}
            disabled={saving || readOnly || !dirty}
            className="hud-chip hud-chip--neon"
            title={
              readOnly
                ? "This world is read-only"
                : dirty
                  ? "Save (Ctrl+S)"
                  : "Everything is saved"
            }
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
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

      {help && (
        <div className="pointer-events-none absolute top-16 right-2 sm:top-20 sm:right-3">
          <HelpPanel onClose={() => setHelp(false)} />
        </div>
      )}

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
          {/* Without this the spawn point is invisible, unmovable state: build a
              castle across the map and Play still drops you on the old plaza. */}
          <button
            onClick={() =>
              useEditorStore
                .getState()
                .setTool(tool === "spawn" ? "place" : "spawn")
            }
            className={`hud-chip ${tool === "spawn" ? "hud-chip--mint" : ""}`}
            title="Set where Play starts you (G)"
          >
            ⚑ Spawn
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
