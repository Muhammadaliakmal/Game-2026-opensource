"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRaceStore, standings, formatLapTime } from "@/stores/race-store";
import { requestRaceRematch, requestStart } from "@/lib/net/race";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";

/**
 * The race HUD.
 *
 * Three things matter while riding and nothing else does: which lap you are on,
 * where you are in the order, and — for the four seconds that decide the race —
 * whether the lights have gone out. Everything that is not one of those waits
 * for the results panel.
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
  const selfId = useRaceStore((s) => s.selfId);

  // Sorting four riders is cheap; doing it on every render of a component that
  // also renders during the countdown and the results is the part worth
  // skipping, and it keeps the array identity stable for the rows below.
  const order = useMemo(() => standings(riders), [riders]);
  const meIndex = order.findIndex((r) => r.id === selfId);
  const me = meIndex >= 0 ? order[meIndex] : null;

  return (
    <>
      {/* ── Top: identity and running order ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
        <div className="hud-panel pointer-events-auto flex items-center gap-2.5 px-3 py-2">
          <span className="bg-signal h-1.5 w-1.5 shrink-0" aria-hidden />
          <span className="text-2xs font-medium">Race</span>
          <span className="hud-divider" />
          <span className="num text-2xs tracking-widest">{code}</span>
        </div>

        <div className="hud-panel pointer-events-auto flex flex-col gap-1 px-3 py-2">
          {order.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-2 text-2xs ${
                r.id === selfId ? "text-signal font-semibold" : "text-steel-200"
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
      </div>

      {/* ── Bottom left: the rider's own lap and position ── */}
      {me && phase !== "waiting" && (
        <div className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 sm:left-3">
          <div className="hud-panel flex flex-col items-center gap-0.5 px-3 py-2">
            <span className="hud-label">Lap</span>
            <span className="num text-steel-050 text-lg font-semibold">
              {Math.min(Math.max(1, me.lap), laps)}
              <span className="text-steel-200 text-2xs">/{laps}</span>
            </span>
            <span className="hud-divider my-1 h-px w-full" />
            <span className="hud-label">Pos</span>
            <span className="num text-signal text-lg font-semibold">
              {meIndex + 1}
              <span className="text-steel-200 text-2xs">/{order.length}</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Chrome ── */}
      <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1.5 sm:right-3 sm:bottom-3">
        <div className="hud-panel pointer-events-auto flex items-center gap-1.5 p-1.5">
          <MuteButton className="hud-chip hud-chip--icon" />
          <FullscreenButton className="hud-chip hud-chip--icon" />
          <Link href="/race" className="hud-chip">
            Leave
          </Link>
        </div>
      </div>

      {/* ── The lights ── */}
      {phase === "countdown" && <Lights ms={countdownMs} />}
      {phase === "racing" && <GreenFlash />}

      {/* ── Waiting for someone to race ── */}
      {phase === "waiting" && connected && (
        <Centred>
          <h2 className="text-steel-050 text-base font-semibold">
            {riders.length < 2 ? "Waiting for riders" : "Ready"}
          </h2>
          <p className="text-steel-200 text-xs">
            Send the code <span className="num text-signal">{code}</span> to
            whoever you want to race. Up to four on the grid.
          </p>
          <button onClick={requestStart} className="hud-chip hud-chip--primary">
            {riders.length < 2 ? "Ride alone" : "Start the race"}
          </button>
        </Centred>
      )}

      {/* ── Results ── */}
      {phase === "finished" && (
        <Centred>
          <h2 className="text-steel-050 text-base font-semibold">
            {order[0]?.id === selfId ? "You won" : `${order[0]?.name} wins`}
          </h2>
          <ol className="flex w-full flex-col gap-1">
            {order.map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-2 text-xs ${
                  r.id === selfId ? "text-signal font-semibold" : "text-steel-200"
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
        </Centred>
      )}

      {error && (
        <Centred>
          <h2 className="text-steel-050 text-base font-semibold">
            Cannot join this race
          </h2>
          <p className="text-steel-200 text-xs">{error}</p>
          <Link href="/race" className="hud-chip hud-chip--primary">
            Back
          </Link>
        </Centred>
      )}
    </>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="hud-panel panel-enter pointer-events-auto flex w-full max-w-xs flex-col items-center gap-3 px-6 py-5 text-center">
        {children}
      </div>
    </div>
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
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
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
      <span className="num text-steel-050 text-5xl font-semibold">
        {seconds > 0 ? seconds : "GO"}
      </span>
    </div>
  );
}

/** A brief green wash as the lights go out, then out of the way. */
function GreenFlash() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      style={{ animation: "raceGo 700ms ease-out forwards" }}
    >
      <span className="text-4xl font-semibold" style={{ color: "#a3e635" }}>
        GO
      </span>
    </div>
  );
}
