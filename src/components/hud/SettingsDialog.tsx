"use client";

import { useEffect, useRef, useState } from "react";
import { MenuIcon } from "@/components/hud/MenuIcon";
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
import {
  TIER_NAMES,
  clearGraphicsPrefs,
  setGraphicsPref,
  setTierOverride,
  tierDefaults,
  useDetectedTier,
  useGraphicsPrefs,
  useTierOverride,
  type GraphicsPrefs,
  type Tier,
} from "@/lib/quality";
import type { TextureMode } from "@/lib/textures/block-shader";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { useHudOverlay } from "@/lib/hud-overlay";
import {
  CONTROL_NAMES,
  DEFAULT_PLACEMENT,
  MAX_SCALE,
  MIN_SCALE,
  useControlLayout,
  type ControlId,
} from "@/lib/control-layout";

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
export function SettingsDialog({
  title,
  onClose,
}: {
  /** The world's name or the race's code — see SettingsButton. */
  title?: string;
  onClose: () => void;
}) {
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
        className="hud-panel hud-panel--modal panel-enter flex max-h-full w-[min(94vw,34rem)] flex-col gap-3 p-4"
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-col">
            <h2 className="text-ink text-base font-semibold">Settings</h2>
            {/* Where you are. The HUD used to carry this permanently in its
                top-left corner, which spent screen on a value that cannot
                change while you play. */}
            {title && (
              <span className="hud-label truncate normal-case">{title}</span>
            )}
          </div>
          <div className="ml-auto flex gap-1">
            {/* The icon is why the label can go on a narrow screen: three
                words plus Done plus a title do not fit across a phone, and a
                tab strip that wraps to a second row pushes the panel's own
                content below the fold. */}
            {(
              [
                ["keyboard", "Keyboard", "keyboard"],
                ["touch", "Touch", "touch"],
                ["display", "Display", "display"],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`hud-chip ${tab === id ? "is-active" : ""}`}
                aria-pressed={tab === id}
                aria-label={label}
                title={label}
              >
                <MenuIcon name={icon} />
                <span className="hidden sm:inline">{label}</span>
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

          {tab === "touch" && (
            <TouchSettings
              onArrange={() => {
                useHudOverlay.getState().setLaying(true);
                onClose();
              }}
            />
          )}
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

/**
 * The control-layout section.
 *
 * ── Why arranging happens outside this dialog ────────────────────────────
 *
 * You cannot place a thumb control while looking at a settings panel: the
 * whole question is whether the button falls under your thumb when you are
 * holding the phone to play, and a modal covering the screen answers it for a
 * grip nobody uses. So this section does not contain the editor — it *starts*
 * it, closing the dialog on the way out so the controls sit over the live
 * world exactly as they will in play. That is also why the editor's own
 * overlay is small and cornered rather than centred.
 *
 * Sizing stays here rather than going with it. A slider needs a label and a
 * value to be legible, which is a row of chrome per control, and thirteen of
 * those over a running game is the panel this was trying to avoid.
 */
function ControlLayoutSettings({ onArrange }: { onArrange: () => void }) {
  const layout = useControlLayout((s) => s.layout);
  const setScale = useControlLayout((s) => s.setScale);
  const clear = useControlLayout((s) => s.clear);
  const resetAll = useControlLayout((s) => s.reset);

  const touched = (Object.keys(layout) as ControlId[]).filter(
    (id) => layout[id] !== undefined
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="hud-label">Layout</h3>
        {touched.length > 0 && (
          <button onClick={resetAll} className="hud-chip ml-auto">
            Reset all
          </button>
        )}
      </div>
      <p className="text-dim text-2xs">
        Put the controls where your thumbs actually are. Arranging happens over
        the game itself — drag any button to move it, and size it here.
      </p>
      <button onClick={onArrange} className="hud-chip hud-chip--primary w-fit">
        Arrange controls
      </button>

      {touched.length > 0 && (
        <div className="mt-1 flex flex-col gap-2.5">
          {touched.map((id) => {
            const p = layout[id] ?? DEFAULT_PLACEMENT;
            return (
              <div key={id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-dim min-w-0 flex-1 truncate text-2xs">
                    {CONTROL_NAMES[id]}
                  </span>
                  <span className="num text-2xs text-dim w-10 text-right">
                    {Math.round(p.scale * 100)}%
                  </span>
                  <button
                    onClick={() => clear(id)}
                    className="hud-chip hud-chip--icon"
                    aria-label={`Reset ${CONTROL_NAMES[id]}`}
                    title="Put this control back"
                  >
                    ↺
                  </button>
                </div>
                <input
                  type="range"
                  min={MIN_SCALE}
                  max={MAX_SCALE}
                  step={0.05}
                  value={p.scale}
                  onChange={(e) => setScale(id, Number(e.target.value))}
                  className="accent-accent min-w-0 flex-1"
                  aria-label={`${CONTROL_NAMES[id]} size`}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TouchSettings({ onArrange }: { onArrange: () => void }) {
  const scheme = usePlayerSettings((s) => s.raceScheme);
  const setScheme = usePlayerSettings((s) => s.setRaceScheme);
  const haptics = usePlayerSettings((s) => s.haptics);
  const setHaptics = usePlayerSettings((s) => s.setHaptics);

  return (
    <div className="flex flex-col gap-4">
      <ControlLayoutSettings onArrange={onArrange} />
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

const TIER_LABELS: Record<Tier, string> = { low: "Low", medium: "Medium", high: "High" };
const TEXTURE_LABELS: Record<TextureMode, string> = {
  flat: "Off",
  surface: "Simple",
  full: "Full",
};

/**
 * One row of choices. The first chip is always "Auto" — the tier's own
 * answer, named so the player can see what they would be getting back.
 */
function ChoiceRow<V extends string>({
  label,
  value,
  auto,
  options,
  onPick,
}: {
  label: string;
  /** The explicit choice, or null for auto. */
  value: V | null;
  /** What auto currently resolves to. */
  auto: string;
  options: Array<[V, string]>;
  onPick(v: V | null): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-dim w-24 shrink-0 text-2xs">{label}</span>
      <button
        onClick={() => onPick(null)}
        className={`hud-chip ${value === null ? "is-active" : ""}`}
        aria-pressed={value === null}
      >
        Auto · {auto}
      </button>
      {options.map(([v, text]) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className={`hud-chip ${value === v ? "is-active" : ""}`}
          aria-pressed={value === v}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Graphics: the tier, and four switches laid over it.
 *
 * `lib/quality.ts` has carried a player override since the tiers were
 * measured, and nothing ever exposed it — a player whose phone was guessed
 * Low had no way to say otherwise. The per-feature rows exist because the
 * usual complaint is about one thing (the glow, the stutter) and the honest
 * fix for one thing is one switch. Each shows what Auto would give, so the
 * choice is made against a known value rather than a blank.
 */
function GraphicsSettings() {
  // Only for the Frame rate row's Auto label, which has to say what this
  // device actually gets rather than a fixed word.
  const coarse = useCoarsePointer();
  const override = useTierOverride();
  const detected = useDetectedTier();
  const prefs = useGraphicsPrefs();
  const touched = override !== null || Object.keys(prefs).length > 0;

  // What each Auto resolves to right now — the tier the override or detection
  // lands on, then that tier's defaults, read the same way the canvases do.
  const tier = override ?? detected;
  const base = tierDefaults(tier);

  const pick = <K extends keyof GraphicsPrefs>(key: K) => (v: GraphicsPrefs[K] | null) =>
    setGraphicsPref(key, v === null ? undefined : v);
  const onOff = (v: boolean | null) => (v === null ? null : v ? "on" : "off");
  const fromOnOff = (v: "on" | "off" | null) => (v === null ? null : v === "on");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="hud-label">Graphics</h3>
        {touched && (
          <button
            onClick={() => {
              setTierOverride(null);
              clearGraphicsPrefs();
            }}
            className="hud-chip ml-auto"
          >
            Reset
          </button>
        )}
      </div>
      <p className="text-dim text-2xs">
        Auto is a guess about this device. If it stutters, drop one thing at a
        time — the render scale first — rather than the whole preset.
      </p>
      <ChoiceRow<Tier>
        label="Quality"
        value={override}
        auto={TIER_LABELS[detected]}
        options={TIER_NAMES.map((t) => [t, TIER_LABELS[t]])}
        onPick={setTierOverride}
      />
      <ChoiceRow<TextureMode>
        label="Surfaces"
        value={prefs.textures ?? null}
        auto={TEXTURE_LABELS[base.textures]}
        options={[
          ["flat", "Off"],
          ["surface", "Simple"],
          ["full", "Full"],
        ]}
        onPick={pick("textures")}
      />
      <ChoiceRow<"on" | "off">
        label="Effects"
        value={onOff(prefs.post ?? null)}
        auto={base.post ? "On" : "Off"}
        options={[
          ["on", "On"],
          ["off", "Off"],
        ]}
        onPick={(v) => pick("post")(fromOnOff(v))}
      />
      <ChoiceRow<"on" | "off">
        label="Shadows"
        value={onOff(prefs.shadows ?? null)}
        auto="On"
        options={[
          ["on", "On"],
          ["off", "Off"],
        ]}
        onPick={(v) => pick("shadows")(fromOnOff(v))}
      />
      <ChoiceRow<"60" | "display">
        label="Frame rate"
        value={prefs.frameRate ?? null}
        /* What Auto resolves to here: a touch device is held at 60 so it does
           not cook, and everything else runs at the panel — which is the only
           way frames land evenly on a display whose rate is not a multiple of
           60. See useFrameCap in lib/quality.ts. */
        auto={coarse ? "60" : "Display"}
        options={[
          ["60", "60"],
          ["display", "Display"],
        ]}
        onPick={pick("frameRate")}
      />
      <ChoiceRow<"fast">
        label="Render scale"
        value={prefs.performanceScale ? "fast" : null}
        auto={base.dpr[1] === 1 ? "1×" : "Native"}
        options={[["fast", "1×"]]}
        onPick={(v) => pick("performanceScale")(v === null ? null : true)}
      />
    </section>
  );
}

function DisplaySettings() {
  const inset = usePlayerSettings((s) => s.hudInset);
  const setInset = usePlayerSettings((s) => s.setHudInset);

  return (
    <div className="flex flex-col gap-4">
      <GraphicsSettings />
      {/*
        Sound and fullscreen live here now as well as on the HUD.

        They were three icon buttons in the race's top-right corner, next to
        the gear that opens this dialog. Three 28px icons in a panel is ~108px,
        and with the session code top-left and lap/position top-centre the top
        row came to within a few pixels of a 360px screen — the point at which
        the next thing added to any of them starts a wrap.

        A readout you glance at while riding has to be on the HUD. A toggle you
        press twice a session does not, so on a phone these two step back into
        the menu and the corner keeps only the gear. On a wider screen they
        stay where they were: the crowding is the reason, and it does not exist
        there. Both components already took a `label` — this is the row form
        they were built for.
      */}
      <section className="flex flex-col gap-2 sm:hidden">
        <h3 className="hud-label">Screen</h3>
        <MuteButton className="hud-menu-item" label="Sound" />
        <FullscreenButton className="hud-menu-item" label="Fullscreen" />
      </section>

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
