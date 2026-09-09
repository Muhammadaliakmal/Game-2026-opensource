"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRaceStore, standings, formatLapTime } from "@/stores/race-store";
import { requestRaceRematch, requestStart } from "@/lib/net/race";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { HudZone, HudZones } from "@/components/hud/HudZones";
import { SettingsButton } from "@/components/hud/SettingsButton";
import { ControlArranger } from "@/components/hud/ControlArranger";
import { BoostMeter, Speedometer } from "./Gauges";

/**
 * The race HUD.
 *
 * Three things matter while riding and nothing else does: which lap you are on,
 * where you are in the order, and — for the four seconds that decide the race —
 * whether the lights have gone out. Everything that is not one of those waits
 * for the results panel.
 *
 * Placement is the genre convention, via HudZones: the running order sits
 * top-left with the session code, the rider's own lap and position sit
 * top-center where every racer puts them, settings sits top-right, and the two
 * gauges take the bottom corners — boost on the left, which you check before a
 * straight, speed on the right, where every racing game has put it for thirty
 * years. The way out is the one departure from the convention — see the
 * bottom-center zone below.
 */
export function RaceHud({ code }: { code: string }) {
  // One selector per field rather than destructuring the whole store. A bare
  // `useRaceStore()` subscribes to every key, so a rider's progress ticking
  // re-rendered the chrome, the results panel and the start lights along with
  // the position board.
  const connected = useRaceStore((s) => s.connected);
  const error = useRaceStore((s) => s.error);
  const phase = useRaceStore((s) => s.phase);
  const laps = useRaceStore((s) => s.laps);
  const countdownMs = useRaceStore((s) => s.countdownMs);
  const riders = useRaceStore((s) => s.riders);
  const target = useRaceStore((s) => s.target);
  const selfId = useRaceStore((s) => s.selfId);

  // Sorting four riders is cheap; doing it on every render of a component that
  // also renders during the countdown and the results is the part worth
  // skipping, and it keeps the array identity stable for the rows below.
  const order = useMemo(() => standings(riders), [riders]);
  const meIndex = order.findIndex((r) => r.id === selfId);
  const me = meIndex >= 0 ? order[meIndex] : null;

  return (
    <>
    <ControlArranger />
    <HudZones mode="race">
      {/* ── Top-left: which race this is, and who is winning it ── */}
      {/* Both of these are `--readout` rather than plain glass, and the reason
          is the same one the boost meter and the speedometer already had: 5.5%
          white over Neon Circuit's checkerboard start straight is a panel the
          road markings read straight through, and the row it happens to worst
          is the one carrying the player's own name. A code and a running order
          are read *while riding*, which is the exact definition `--readout`
          exists for — they were simply never moved onto it. */}
      <HudZone at="top-left">
        <div className="hud-panel hud-panel--readout pointer-events-auto flex items-center gap-2.5 px-3 py-2">
          <span className="bg-accent h-1.5 w-1.5 shrink-0" aria-hidden />
          <span className="text-2xs font-medium">Race</span>
          <span className="hud-divider" />
          <span className="num text-2xs tracking-widest">{code}</span>
        </div>

        <div className="hud-panel hud-panel--readout pointer-events-auto flex flex-col gap-1 px-3 py-2">
          {order.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-2 text-2xs ${
                r.id === selfId ? "text-accent font-semibold" : "text-dim"
              }`}
            >
              <span className="num w-3 text-right opacity-70">{i + 1}</span>
              <span className="max-w-24 truncate">{r.name}</span>
              <span className="num ml-auto opacity-70">
                {r.place > 0 ? formatLapTime(r.timeMs) : `L${Math.max(1, r.lap)}`}
              </span>
            </div>
          ))}
          {order.length === 0 && (
            <span className="hud-label">Waiting for riders</span>
          )}
        </div>
      </HudZone>

      {/* ── Top-center: the rider's own lap and position ──
          Horizontal rather than the stacked panel this used to be at mid-left:
          two values read side by side in one glance, and the middle of the
          screen stays clear for the road. */}
      {me && phase !== "waiting" && (
        <HudZone at="top-center">
          <div className="hud-panel hud-panel--readout flex items-stretch gap-3 px-3 py-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <span className="hud-label">Lap</span>
              <span className="hud-readout text-lg">
                {Math.min(Math.max(1, me.lap), laps)}
                <span className="text-dim text-2xs">/{laps}</span>
              </span>
            </div>
            <span className="hud-divider" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="hud-label">Pos</span>
              <span className="hud-readout text-accent text-lg">
                {meIndex + 1}
                <span className="text-dim text-2xs">/{order.length}</span>
              </span>
            </div>
          </div>
        </HudZone>
      )}

      {/* ── Top-right: the session chrome, where every game puts it ──
             Three icon buttons is ~108px, and with the session code top-left
             and lap/position top-centre the row came to within a few pixels of
             a 360px screen. Sound and fullscreen are pressed twice a session,
             so on a phone they step back into Settings (see its Display tab)
             and the corner keeps only the gear. They stay on a wider screen,
             because the crowding is the whole reason and it does not exist
             there. ── */}
      <HudZone at="top-right">
        <div className="hud-panel pointer-events-auto flex items-center gap-1.5 p-1.5">
          <MuteButton className="hud-chip hud-chip--icon hud-chip--touch hidden sm:inline-flex" />
          <FullscreenButton className="hud-chip hud-chip--icon hud-chip--touch hidden sm:inline-flex" />
          <SettingsButton
            className="hud-chip hud-chip--icon hud-chip--touch"
            title={`Neon Circuit · ${code}`}
          />
        </div>
      </HudZone>

      {/* ── The gauges. Only once there is a bike to gauge: on the grid they
             would read zero, and a speedometer that says 0 for a minute is a
             speedometer nobody looks at again. ── */}
      {phase !== "waiting" && (
        <HudZone at="bottom-left">
          <BoostMeter />
        </HudZone>
      )}
      {phase !== "waiting" && (
        <HudZone at="bottom-right">
          <Speedometer />
        </HudZone>
      )}

      {/* ── Bottom-center: the way out ──
          It was the last chip in the top-right row, which made leaving the
          race the neighbour of three icons that only change a setting — and
          the far corner of a phone held in two hands is the one place neither
          thumb reaches without regripping. The middle of the bottom edge is
          reachable and, because the thumb clusters own the corners, is the
          one strip down there that nothing rests on.

          That last part was only true on a wide screen. On a phone the
          clusters spread far enough to meet in the middle and this sat under
          them — the way out of a race was the one control you could not press.
          The zone now holds itself above the control band (`--controls-h`, see
          HudZones), so the strip is real at every width rather than only where
          there happened to be room. ── */}
      <HudZone at="bottom-center">
        <Link
          href="/race"
          className="hud-chip hud-chip--touch pointer-events-auto"
        >
          Leave
        </Link>
      </HudZone>

      {/* ── Center: the things that briefly own the screen ── */}
      <HudZone at="center">
        {phase === "countdown" && <Lights ms={countdownMs} />}
        {phase === "racing" && <GreenFlash />}

        {phase === "waiting" && connected && (
          <Panel>
            <h2 className="text-ink text-base font-semibold">
              {riders.length >= target ? "Ready" : "Waiting for riders"}
            </h2>

            {/*
              The grid as slots rather than as a sentence. "2 of 4" is a fact
              you read; four boxes with two of them lit is a thing you glance
              at — and while you are waiting for people to arrive, glancing is
              all anyone does.
            */}
            <div className="flex items-center gap-1.5" aria-hidden>
              {Array.from({ length: target }, (_, i) => (
                <span
                  key={i}
                  className="h-2.5 w-6"
                  style={{
                    background:
                      i < riders.length
                        ? "var(--color-accent)"
                        : "rgb(255 255 255 / 0.12)",
                    boxShadow:
                      i < riders.length ? "var(--glow)" : "none",
                    transition: "background 160ms var(--ease-ui)",
                  }}
                />
              ))}
              <span className="num text-dim ml-1 text-2xs">
                {riders.length}/{target}
              </span>
            </div>
            <span className="sr-only">
              {riders.length} of {target} riders on the grid
            </span>

            {/* The code is the entire point of this screen — it is the one
                string somebody reads off one phone and types into another —
                so it is a target rather than a word in a sentence. It used to
                be four accent-coloured characters mid-paragraph over a
                checkerboard. */}
            <RoomCode code={code} />

            <p className="text-dim text-xs">
              Send it to whoever you want to race. The lights go on their own
              once the grid is full.
            </p>

            <button
              onClick={requestStart}
              className="hud-chip hud-chip--primary"
            >
              {riders.length < 2 ? "Ride alone" : "Start now"}
            </button>
          </Panel>
        )}

        {phase === "finished" && (
          <Panel>
            <h2 className="text-ink text-base font-semibold">
              {order[0]?.id === selfId ? "You won" : `${order[0]?.name} wins`}
            </h2>
            <ol className="flex w-full flex-col gap-1">
              {order.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center gap-2 text-xs ${
                    r.id === selfId ? "text-accent font-semibold" : "text-dim"
                  }`}
                >
                  <span className="num w-4 text-right opacity-70">{i + 1}</span>
                  <span className="truncate">{r.name}</span>
                  <span className="num ml-auto">
                    {r.timeMs > 0 ? formatLapTime(r.timeMs) : "—"}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <button
                onClick={requestRaceRematch}
                className="hud-chip hud-chip--primary"
              >
                Race again
              </button>
              <Link href="/race" className="hud-chip">
                Leave
              </Link>
            </div>
          </Panel>
        )}

        {error && (
          <Panel>
            <h2 className="text-ink text-base font-semibold">
              Cannot join this race
            </h2>
            <p className="text-dim text-xs">{error}</p>
            <Link href="/race" className="hud-chip hud-chip--primary">
              Back
            </Link>
          </Panel>
        )}
      </HudZone>
    </HudZones>
    </>
  );
}

/**
 * A panel that owns the middle of the screen.
 *
 * It no longer positions itself — the center zone does that — so this is only
 * the panel's own material and width. `max-w-xs` still matters: the zone is
 * one third of the screen wide on a phone, and a results list needs a floor.
 */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The scrim, and why it is not just a darker panel.

          Blur alone does not separate a modal from a high-frequency
          background — it averages the background without darkening it, so a
          checkerboard blurs to an evenly bright grey and white text on it is
          still unreadable. The fill is what buys the contrast; the blur is the
          part that makes it look deliberate.

          `fixed` rather than absolute: the panel lives inside the HUD grid,
          which is inset by the safe area, and a scrim that stopped at the
          notch would be a lit strip along the top of a dimmed screen. */}
      <div className="hud-scrim" aria-hidden />
      <div className="hud-panel hud-panel--modal panel-enter pointer-events-auto relative flex w-[min(20rem,80vw)] flex-col items-center gap-3 px-6 py-5 text-center">
        {children}
      </div>
    </>
  );
}

/**
 * The room code, as a thing you copy rather than a thing you transcribe.
 *
 * The clipboard write is best-effort and silent on failure: `navigator
 * .clipboard` needs a secure context and can be refused outright, and a race
 * lobby is not the place to explain that. The code is still on screen at a
 * size that can be read across a table, which is the floor this has to clear.
 */
function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  // Cleared on a timer, so the confirmation gets out of the way by itself.
  // Cleaned up on unmount as well — the lobby closes the moment the lights go
  // out, which is well inside the two seconds.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(
          () => setCopied(true),
          () => {}
        );
      }}
      className="hud-chip--touch flex flex-col items-center gap-1.5 bg-transparent p-0"
      aria-label={`Room code ${code.split("").join(" ")}. Copy.`}
    >
      <span className="room-code" aria-hidden>
        {code}
      </span>
      <span className="hud-label">{copied ? "Copied" : "Tap to copy"}</span>
    </button>
  );
}

/**
 * The start lights.
 *
 * Counted down from the server's own remaining-milliseconds rather than from a
 * deadline: the two machines' clocks are not the same, and a start light half a
 * second out is worse than one that ticks.
 */
function Lights({ ms }: { ms: number }) {
  const seconds = Math.ceil(ms / 1000);
  return (
    <div className="pointer-events-none flex flex-col items-center gap-3">
      <div className="flex gap-3">
        {[3, 2, 1].map((n) => (
          <span
            key={n}
            className="h-4 w-4 rounded-full transition-colors duration-150"
            style={{
              background: seconds <= n ? "#ef4444" : "rgba(255,255,255,0.12)",
              boxShadow: seconds <= n ? "0 0 20px -2px #ef4444" : "none",
            }}
          />
        ))}
      </div>
      <span className="hud-readout text-5xl">{seconds > 0 ? seconds : "GO"}</span>
    </div>
  );
}

/** A brief green wash as the lights go out, then out of the way. */
function GreenFlash() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex items-center justify-center"
      style={{ animation: "raceGo 700ms ease-out forwards" }}
    >
      <span className="text-4xl font-semibold" style={{ color: "#a3e635" }}>
        GO
      </span>
    </div>
  );
}
