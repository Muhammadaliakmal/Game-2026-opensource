"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEditorStore, type Tool } from "@/stores/editor-store";
import { PALETTE, FINISHES, type Shape } from "@/lib/worlddoc";
import { SHAPE_NAMES } from "./shapes";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { useCoarsePointer } from "@/lib/use-media-query";

/**
 * The editor chrome: floating islands over a full-bleed canvas, never a
 * sidebar or a dashboard frame — the world fills the screen and the interface
 * sits on top of it (UI spec §3.2).
 *
 * The outer layer is `pointer-events-none` so clicks fall through to the
 * canvas; each island re-enables pointer events for itself. That matters more
 * than it looks: invisible HUD padding that swallows clicks meant for the
 * world produces "sometimes my block does not place" bugs that are miserable
 * to track down.
 */

const HELP_SEEN_KEY = "blockworld:editor-help-seen";

const CONTROLS: Array<[string, string]> = [
  ["Left drag", "use the current tool"],
  ["Right drag", "orbit"],
  ["Middle drag", "pan"],
  ["Scroll", "zoom"],
  ["Two fingers", "orbit and zoom on touch"],
  ["F", "frame the whole world"],
  ["B / E", "build / erase"],
  ["G / I", "paint / pick"],
  ["S", "move the spawn point"],
  ["1 – 9", "pick a colour"],
  ["Shift + 1 – 4", "pick a shape"],
  ["R", "rotate the brush"],
  ["Ctrl + Z / Y", "undo / redo"],
  ["Ctrl + S", "save"],
  ["?", "show or hide this list"],
];

/** 16px line icons, inheriting `currentColor` so they follow the active state. */
function Icon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const TOOL_ICONS: Record<
  Exclude<Tool, never>,
  { path: string; label: string; key: string }
> = {
  place: {
    path: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5",
    label: "Build",
    key: "B",
  },
  erase: {
    path: "M4 16l7-7 6 6-4 4H7l-3-3zM10 20h9",
    label: "Erase",
    key: "E",
  },
  paint: {
    path: "M12 3s5 5.5 5 8.5a5 5 0 0 1-10 0C7 8.5 12 3 12 3z",
    label: "Paint",
    key: "G",
  },
  pick: {
    path: "M18 3l3 3-9 9-3 .5.5-3 8.5-9zM8.5 12.5L4 17v3h3l4.5-4.5",
    label: "Pick",
    key: "I",
  },
  spawn: {
    path: "M6 21V4M6 4h11l-2.5 3.5L17 11H6",
    label: "Spawn",
    key: "S",
  },
};

const TOOL_ORDER: Tool[] = ["place", "erase", "paint", "pick", "spawn"];

/** The keyboard/mouse legend. Shown automatically the first time only. */
function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="hud-panel panel-enter pointer-events-auto w-[min(92vw,20rem)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">Controls</span>
        <button
          onClick={onClose}
          className="hud-chip"
          aria-label="Close controls"
        >
          Close
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        {CONTROLS.map(([key, what]) => (
          <div key={key} className="contents">
            <dt className="bg-steel-800 text-steel-050 justify-self-start rounded-[var(--radius)] px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-white/10">
              {key}
            </dt>
            <dd className="text-steel-200 text-2xs">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Hovered cell and part count, written straight to the DOM.
 *
 * The hovered cell changes every time the cursor crosses a grid line, which is
 * many times a second during a drag. Routing that through React state would
 * re-render this component (and anything else subscribed) at pointer speed —
 * the one thing the UI spec §5 is most explicit about. Subscribing to the
 * store outside React and setting textContent costs nothing.
 */
function Readout() {
  const cell = useRef<HTMLSpanElement>(null);
  const parts = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const draw = () => {
      const s = useEditorStore.getState();
      if (cell.current) {
        cell.current.textContent = s.hoverCell
          ? `x ${s.hoverCell[0]}  y ${s.hoverCell[1]}  z ${s.hoverCell[2]}`
          : "x —  y —  z —";
      }
      if (parts.current) {
        parts.current.textContent = `${s.parts.size.toLocaleString()} blocks`;
      }
    };
    draw();
    return useEditorStore.subscribe(draw);
  }, []);

  return (
    <div className="num text-steel-200/60 pointer-events-none shrink-0 text-right text-2xs leading-snug">
      <span ref={cell} className="block" />
      <span ref={parts} className="block" />
    </div>
  );
}

/**
 * Shown once per mount on touch devices. Fades on a timer rather than waiting
 * for a dismiss tap — a tap here is a tap the builder meant to spend on a
 * block.
 */
function TouchHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3 transition-opacity duration-700 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="hud-panel text-steel-200 px-3 py-2 text-center text-2xs">
        One finger builds · two fingers move the camera
      </div>
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
  const touch = useCoarsePointer();
  const [entering, setEntering] = useState(false);
  const [remixing, setRemixing] = useState(false);

  // Read on first render, not in an effect: this component only ever renders
  // in the browser (EditorCanvas is a dynamic ssr:false import), so there is
  // no server render to mismatch, and a setState-in-effect would cascade.
  const [help, setHelp] = useState(() => {
    try {
      return !window.localStorage.getItem(HELP_SEEN_KEY);
    } catch {
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

  // historyTick is not rendered directly — subscribing is what makes the undo
  // buttons refresh after an imperative edit.
  const historyTick = useEditorStore((s) => s.historyTick);
  void historyTick;

  const store = useEditorStore.getState();
  const canUndo = store.bus.canUndo;
  const canRedo = store.bus.canRedo;

  // The legend opens unprompted on a first visit, then never again. A
  // first-run editor with no visible instructions is the most common way a
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
   * on the jump — save first, and do NOT navigate if that save failed.
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

  const statusLabel = saving
    ? "Saving"
    : readOnly
      ? "Read-only"
      : dirty
        ? "Unsaved changes"
        : lastSavedAt
          ? "Saved"
          : "No changes yet";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-2">
      {/* ── Top: identity left, actions right ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="hud-panel pointer-events-auto flex min-w-0 items-center gap-1.5 p-1">
            <Link
              href="/"
              className="hud-chip hud-chip--icon"
              title="Back to your worlds"
              aria-label="Back to your worlds"
            >
              <Icon path="M15 5l-7 7 7 7" />
            </Link>
            <input
              value={name}
              onChange={(e) => useEditorStore.getState().setName(e.target.value)}
              disabled={readOnly}
              className="text-steel-050 placeholder:text-steel-500 min-w-0 flex-1 bg-transparent px-1 text-2xs font-medium outline-none disabled:opacity-70 sm:w-40 sm:flex-none"
              aria-label="World name"
              placeholder="World name"
            />
            <span
              className={`h-1.5 w-1.5 shrink-0 ${
                readOnly
                  ? "bg-steel-500"
                  : saving || dirty
                    ? "bg-signal"
                    : "bg-steel-200"
              }`}
              title={statusLabel}
              aria-label={statusLabel}
            />
          </div>

          {/* Say a world is read-only BEFORE the work happens, and offer the
              one action that does work: copy it. */}
          {lockedReason && (
            <div className="hud-panel pointer-events-auto flex max-w-[min(92vw,26rem)] flex-wrap items-center gap-2 px-2 py-1.5">
              <span className="text-signal text-2xs">{lockedReason}</span>
              <button
                onClick={remix}
                disabled={remixing}
                className="hud-chip hud-chip--primary"
              >
                {remixing ? "Copying…" : "Make my copy"}
              </button>
            </div>
          )}

          {saveError && (
            <div className="hud-panel pointer-events-auto flex max-w-[min(92vw,26rem)] items-center gap-2 px-2 py-1.5">
              <span className="text-danger text-2xs">{saveError}</span>
              <button onClick={onDismissSaveError} className="hud-chip">
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1 p-1">
          <MuteButton className="hud-chip hud-chip--icon" />
          <FullscreenButton className="hud-chip hud-chip--icon" />
          <button
            onClick={() => setHelp((v) => !v)}
            className={`hud-chip hud-chip--icon ${help ? "is-active" : ""}`}
            title="Controls (?)"
            aria-label="Show controls"
            aria-pressed={help}
          >
            ?
          </button>
          <span className="hud-divider" />
          <button
            onClick={onSave}
            disabled={saving || readOnly || !dirty}
            className={`hud-chip ${dirty && !readOnly ? "is-active" : ""}`}
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
            className="hud-chip hud-chip--primary"
            title="Save and walk around your world"
          >
            {entering ? "Entering…" : "Play"}
          </button>
        </div>
      </div>

      {help && (
        <div className="pointer-events-none absolute top-14 right-2">
          <HelpPanel onClose={() => setHelp(false)} />
        </div>
      )}

      {/* On a phone the split between "one finger builds" and "two fingers
          move the camera" is the one thing that has to be said out loud —
          nothing on screen implies it. */}
      {touch && !help && <TouchHint />}

      {/* ── Bottom: tools and palette left, readout right ── */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {/* Palette: 0-radius swatches, because blocks are not round and a
              pill stops reading as a block. */}
          <div className="hud-panel hud-scroll pointer-events-auto flex max-w-[min(92vw,32rem)] flex-nowrap gap-1 overflow-x-auto p-1.5 sm:flex-wrap">
            {PALETTE.map((hex, i) => (
              <button
                key={hex + i}
                onClick={() => useEditorStore.getState().setColorIndex(i)}
                style={{ background: hex }}
                className="swatch relative"
                aria-label={`Colour ${i + 1}`}
                aria-pressed={colorIndex === i}
                title={i < 9 ? `Colour ${i + 1} (${i + 1})` : `Colour ${i + 1}`}
              >
                {/* Number-key hint on the first nine, per the spec. */}
                {i < 9 && (
                  <span className="pointer-events-none absolute right-0.5 bottom-0 text-[11px] leading-none font-semibold text-white/80 mix-blend-difference">
                    {i + 1}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="hud-scroll flex max-w-[calc(100vw-1rem)] items-center gap-2 overflow-x-auto">
            {/* Tool group */}
            <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1 p-1">
              {TOOL_ORDER.map((t) => (
                <button
                  key={t}
                  onClick={() => useEditorStore.getState().setTool(t)}
                  className={`hud-chip hud-chip--icon ${tool === t ? "is-active" : ""}`}
                  title={`${TOOL_ICONS[t].label} (${TOOL_ICONS[t].key})`}
                  aria-label={TOOL_ICONS[t].label}
                  aria-pressed={tool === t}
                >
                  <Icon path={TOOL_ICONS[t].path} />
                </button>
              ))}
              <span className="hud-divider" />
              <button
                onClick={() => useEditorStore.getState().undo()}
                disabled={!canUndo}
                className="hud-chip hud-chip--icon"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Icon path="M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3" />
              </button>
              <button
                onClick={() => useEditorStore.getState().redo()}
                disabled={!canRedo}
                className="hud-chip hud-chip--icon"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Icon path="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
              </button>
            </div>

            {/* Brush: shape, finish, rotation */}
            <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1 p-1">
              {SHAPE_NAMES.map((label, i) => (
                <button
                  key={label}
                  onClick={() => useEditorStore.getState().setShape(i as Shape)}
                  className={`hud-chip ${shape === i ? "is-active" : ""}`}
                  title={`${label} (Shift+${i + 1})`}
                >
                  {label}
                </button>
              ))}
              <span className="hud-divider" />
              {FINISHES.map((label, i) => (
                <button
                  key={label}
                  onClick={() => useEditorStore.getState().setFinish(i)}
                  className={`hud-chip ${finish === i ? "is-active" : ""}`}
                  title={`${label} finish`}
                >
                  {label}
                </button>
              ))}
              <span className="hud-divider" />
              <button
                onClick={() => useEditorStore.getState().rotateBrush()}
                className="hud-chip num"
                title="Rotate (R)"
              >
                {rot * 90}°
              </button>
            </div>
          </div>
        </div>

        <Readout />
      </div>
    </div>
  );
}
