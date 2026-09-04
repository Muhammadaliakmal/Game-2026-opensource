"use client";

import { useEffect, useRef, useState } from "react";
import {
  FOOT_ACTIONS,
  FOOT_LABELS,
  MAX_KEYS_PER_ACTION,
  PRESETS,
  RIDE_ACTIONS,
  RIDE_LABELS,
  UNBINDABLE,
  findConflicts,
  keyLabel,
  presetOf,
  useKeybinds,
  type Context,
  type PresetId,
} from "@/lib/keybinds";
import {
  RACE_SCHEMES,
  haptic,
  usePlayerSettings,
  type RaceScheme,
} from "@/lib/player-settings";
import { useCoarsePointer } from "@/lib/use-media-query";

/**
 * Settings: controls, touch, and the safe frame.
 *
 * ── Why this is a modal, when the rest of the app avoids them ────────────
 *
 * SPEC §3.3 bans modals for anything that interrupts play, and it is right to.
 * This is the exception the rule implies: a settings screen IS the interruption
 * — it is where you go when you have stopped — and the alternative, a panel
 * that shares the screen with a game still running underneath, means the
 * character walks off a ledge while you rebind the key that would have saved
 * them. Hence the keyboard gate below.
 *
 * ── The keyboard gate ────────────────────────────────────────────────────
 *
 * While this is open, every key event is stopped at the window in the capture
 * phase, before drei's `KeyboardControls` (which listens on the document) can
 * see it. That does two jobs with one listener: pressing W to rebind it does
 * not also walk forward, and a player in a menu cannot drive off the track.
 * `stopPropagation` and not `preventDefault`, so Tab still moves focus and the
 * dialog stays keyboard-navigable.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const coarse = useCoarsePointer();
  const [tab, setTab] = useState<"keyboard" | "touch" | "display">(
    coarse ? "touch" : "keyboard"
  );
  /** Which slot is listening for a key, if any. */
  const [capture, setCapture] = useState<{
    ctx: Context;
    action: string;
    index: number;
  } | null>(null);

  const binds = useKeybinds((s) => s.binds);
  const setBinding = useKeybinds((s) => s.setBinding);
  const applyPreset = useKeybinds((s) => s.applyPreset);
  const resetBinds = useKeybinds((s) => s.reset);

  const conflicts = findConflicts(binds);
  const preset = presetOf(binds);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();

      if (capture) {
        // Escape leaves the capture, not the dialog: cancelling a rebind and
        // closing the whole screen are different intentions and the same key
        // cannot mean both.
        e.preventDefault();
        if (e.code === "Escape") {
          setCapture(null);
          return;
        }
        if (UNBINDABLE.has(e.code)) return;
        const list = [
          ...(binds[capture.ctx] as unknown as Record<string, string[]>)[
            capture.action
          ],
        ];
        list[capture.index] = e.code;
        setBinding(capture.ctx, capture.action, list);
        setCapture(null);
        return;
      }

      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const swallow = (e: KeyboardEvent) => e.stopPropagation();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", swallow, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", swallow, true);
    };
  }, [capture, binds, setBinding, onClose]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center p-4"
      // A scrim rather than the glass used everywhere else: this is the one
      // surface that wants the world behind it to stop competing for the eye.
      style={{ background: "rgb(4 4 8 / 0.66)" }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="hud-panel panel-enter flex max-h-full w-[min(94vw,34rem)] flex-col gap-3 p-4"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-ink text-base font-semibold">Settings</h2>
          <div className="ml-auto flex gap-1">
            {(
              [
                ["keyboard", "Keyboard"],
                ["touch", "Touch"],
                ["display", "Display"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`hud-chip ${tab === id ? "is-active" : ""}`}
                aria-pressed={tab === id}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="hud-chip"
            autoFocus
            aria-label="Close settings"
          >
            Done
          </button>
        </div>

        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === "keyboard" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="hud-label">Layout</span>
                {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => applyPreset(id)}
                    className={`hud-chip ${preset === id ? "is-active" : ""}`}
                  >
                    {PRESETS[id].name}
                  </button>
                ))}
                {preset === null && <span className="hud-label">Custom</span>}
                <button onClick={resetBinds} className="hud-chip ml-auto">
                  Reset
                </button>
              </div>

              {conflicts.length > 0 && (
                // Shown, not prevented: two actions on one key is sometimes
                // exactly what a player meant, and the interface's job is to
                // be sure they know rather than to refuse.
                <div className="flex flex-col gap-1 rounded-[var(--radius)] border border-[color-mix(in_oklab,var(--color-danger)_50%,transparent)] px-3 py-2">
                  <span className="text-danger text-2xs font-semibold">
                    {conflicts.length === 1
                      ? "One key does two things"
                      : `${conflicts.length} keys do two things`}
                  </span>
                  {conflicts.map((c) => (
                    <span key={c.context + c.code} className="text-dim text-2xs">
                      <span className="num">{keyLabel(c.code)}</span>{" "}
                      {c.context === "foot" ? "on foot" : "riding"}:{" "}
                      {c.actions
                        .map((a) =>
                          c.context === "foot"
                            ? FOOT_LABELS[a as keyof typeof FOOT_LABELS]
                            : RIDE_LABELS[a as keyof typeof RIDE_LABELS]
                        )
                        .join(" · ")}
                    </span>
                  ))}
                </div>
              )}

              <BindSection
                title="On foot"
                ctx="foot"
                actions={FOOT_ACTIONS}
                labels={FOOT_LABELS}
                capture={capture}
                onCapture={setCapture}
              />
              <BindSection
                title="Riding"
                ctx="ride"
                actions={RIDE_ACTIONS}
                labels={RIDE_LABELS}
                capture={capture}
                onCapture={setCapture}
              />
            </div>
          )}

          {tab === "touch" && <TouchSettings />}
          {tab === "display" && <DisplaySettings />}
        </div>
      </div>
    </div>
  );
}

function BindSection<A extends string>({
  title,
  ctx,
  actions,
  labels,
  capture,
  onCapture,
}: {
  title: string;
  ctx: Context;
  actions: readonly A[];
  labels: Record<A, string>;
  capture: { ctx: Context; action: string; index: number } | null;
  onCapture(c: { ctx: Context; action: string; index: number } | null): void;
}) {
  const binds = useKeybinds((s) => s.binds);
  const setBinding = useKeybinds((s) => s.setBinding);
  const map = binds[ctx] as unknown as Record<string, string[]>;

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="hud-label">{title}</h3>
      {actions.map((action) => {
        const codes = map[action] ?? [];
        return (
          <div key={action} className="flex items-center gap-2">
            <span className="text-dim min-w-0 flex-1 truncate text-2xs">
              {labels[action]}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {codes.map((code, i) => {
                const listening =
                  capture?.ctx === ctx &&
                  capture.action === action &&
                  capture.index === i;
                return (
                  <button
                    key={`${code}-${i}`}
                    onClick={() => onCapture({ ctx, action, index: i })}
                    onContextMenu={(e) => {
                      // Right-click unbinds. A key you want gone is one click
                      // away rather than a rebind to something harmless.
                      e.preventDefault();
                      setBinding(
                        ctx,
                        action,
                        codes.filter((_, j) => j !== i)
                      );
                    }}
                    className={`hud-chip num ${listening ? "is-active" : ""}`}
                    title="Click to rebind · right-click to remove"
                  >
                    {listening ? "Press a key…" : keyLabel(code)}
                  </button>
                );
              })}
              {codes.length < MAX_KEYS_PER_ACTION && (
                <button
                  onClick={() =>
                    onCapture({ ctx, action, index: codes.length })
                  }
                  className={`hud-chip hud-chip--icon ${
                    capture?.ctx === ctx &&
                    capture.action === action &&
                    capture.index === codes.length
                      ? "is-active"
                      : ""
                  }`}
                  aria-label={`Add a key for ${labels[action]}`}
                  title="Add another key"
                >
                  +
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TouchSettings() {
  const scheme = usePlayerSettings((s) => s.raceScheme);
  const setScheme = usePlayerSettings((s) => s.setRaceScheme);
  const haptics = usePlayerSettings((s) => s.haptics);
  const setHaptics = usePlayerSettings((s) => s.setHaptics);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="hud-label">Steering</h3>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(RACE_SCHEMES) as RaceScheme[]).map((id) => (
            <button
              key={id}
              onClick={() => {
                setScheme(id);
                haptic();
              }}
              aria-pressed={scheme === id}
              className={`hud-menu-item ${scheme === id ? "is-active" : ""}`}
            >
              <span className="flex flex-col items-start">
                <span>{RACE_SCHEMES[id].name}</span>
                <span className="text-dim text-2xs opacity-70">
                  {RACE_SCHEMES[id].blurb}
                </span>
              </span>
              {scheme === id && <span className="hud-menu-state">On</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="hud-label">Feedback</h3>
        <button
          onClick={() => {
            setHaptics(!haptics);
            if (!haptics) haptic();
          }}
          aria-pressed={haptics}
          className={`hud-menu-item ${haptics ? "is-active" : ""}`}
        >
          Vibration
          <span className="hud-menu-state">{haptics ? "On" : "Off"}</span>
        </button>
      </section>
    </div>
  );
}

function DisplaySettings() {
  const inset = usePlayerSettings((s) => s.hudInset);
  const setInset = usePlayerSettings((s) => s.setHudInset);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="hud-label">Safe frame</h3>
        <p className="text-dim text-2xs">
          Pulls the whole HUD in from the edges. Phone bezels and TV overscan
          are not something the page can measure, so this is the manual answer —
          it is added to whatever the device already reports.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={48}
            step={4}
            value={inset}
            onChange={(e) => setInset(Number(e.target.value))}
            className="accent-accent min-w-0 flex-1"
            aria-label="HUD safe frame"
          />
          <span className="num text-2xs w-10 text-right">{inset}px</span>
        </div>
      </section>
    </div>
  );
}
