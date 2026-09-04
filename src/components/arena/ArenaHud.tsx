"use client";

import { useState } from "react";
import Link from "next/link";
import { requestRematch } from "@/lib/net/arena";
import { splitFighters, useArenaStore } from "@/stores/arena-store";
import { HudZone, HudZones } from "@/components/hud/HudZones";

const MAX_HP = 100;
const WIN_AT = 5;

/**
 * The match HUD.
 *
 * Same restraint as the play HUD: what is on screen is what cannot be
 * discovered by pressing something — the two health bars, the score, and the
 * one thing you do (swing). The rest of the screen belongs to the fight.
 *
 * Placement is the fighting-game convention, via HudZones: the two fighters
 * face each other across the top, yours on the left, and the match identity
 * sits between them. The swing button is bottom-right, on the same thumb as
 * every other primary action in the app.
 */
export function ArenaHud({ code, onAttack }: { code: string; onAttack: () => void }) {
  // One selector per field: zustand v5 re-renders on reference change, and an
  // object literal selector would build a new one every time it ran.
  const phase = useArenaStore((s) => s.phase);
  const winner = useArenaStore((s) => s.winner);
  const fighters = useArenaStore((s) => s.fighters);
  const selfId = useArenaStore((s) => s.selfId);
  const hurtTick = useArenaStore((s) => s.hurtTick);
  const { me, them } = splitFighters(fighters, selfId);

  return (
    <>
      {/* Outside the zone grid on purpose: a full-screen wash is not a panel,
          and pushing it inside the safe-area insets would leave an unwashed
          frame around the notch. */}
      <HurtFlash tick={hurtTick} />

      <HudZones mode="arena">
        {/* ── The two fighters, facing each other across the top ── */}
        <HudZone at="top-left">
          <HealthBar label={me?.name ?? "You"} hp={me?.hp ?? MAX_HP} score={me?.score ?? 0} mine />
        </HudZone>

        <HudZone at="top-center">
          <div className="hud-panel pointer-events-auto flex items-center gap-2 px-3 py-2">
            <span className="hud-label">Match</span>
            <span className="num text-2xs tracking-widest">{code}</span>
          </div>
        </HudZone>

        <HudZone at="top-right">
          <HealthBar
            label={them?.name ?? "Waiting…"}
            hp={them?.hp ?? 0}
            score={them?.score ?? 0}
            absent={!them}
          />
        </HudZone>

        {/* ── Center: the two moments that own the screen ── */}
        <HudZone at="center">
          {phase === "waiting" && (
            <Banner
              title="Waiting for a challenger"
              body={`Share this link — the code is ${code}. The fight starts when someone joins.`}
              action={<CopyLink />}
            />
          )}

          {phase === "over" && (
            <Banner
              title={winner === selfId ? "You win" : "You lose"}
              body={`First to ${WIN_AT} knockdowns.`}
              action={
                <div className="flex gap-2">
                  <button className="hud-chip hud-chip--primary" onClick={requestRematch}>
                    Rematch
                  </button>
                  <Link href="/arena" className="hud-chip">
                    Leave
                  </Link>
                </div>
              }
            />
          )}
        </HudZone>

        {/* The one control. A key for a keyboard, a big target for a thumb —
            and the keyboard's version stays on the far side of the screen so
            it never sits under the thumb that is pressing the button. */}
        <HudZone at="bottom-left" className="hidden sm:flex">
          <span className="hud-label">F — swing</span>
        </HudZone>

        <HudZone at="bottom-right">
          <button
            className="hud-chip hud-chip--danger pointer-events-auto h-16 w-16 rounded-full text-sm font-semibold"
            onClick={onAttack}
            disabled={phase !== "fighting"}
            aria-label="Swing"
          >
            HIT
          </button>
        </HudZone>
      </HudZones>
    </>
  );
}

function HealthBar({
  label,
  hp,
  score,
  mine = false,
  absent = false,
}: {
  label: string;
  hp: number;
  score: number;
  mine?: boolean;
  absent?: boolean;
}) {
  return (
    <div className="hud-panel pointer-events-auto flex min-w-0 flex-col gap-1.5 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-2xs font-medium">{label}</span>
        <span className="num text-2xs opacity-70">
          {score}/{WIN_AT}
        </span>
      </div>
      <div className="bg-base h-1.5 w-24 overflow-hidden rounded-full sm:w-32">
        <div
          className={`h-full transition-[width] duration-200 ${
            mine ? "bg-accent" : "bg-white/70"
          }`}
          style={{ width: `${absent ? 0 : Math.max(0, Math.min(100, hp))}%` }}
        />
      </div>
    </div>
  );
}

function Banner({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="hud-panel pointer-events-auto panel-enter flex max-w-sm flex-col items-center gap-3 px-6 py-5 text-center">
      <h2 className="text-ink text-base font-semibold">{title}</h2>
      <p className="text-dim text-xs">{body}</p>
      {action}
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="hud-chip"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(window.location.href)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? "Link copied" : "Copy invite link"}
    </button>
  );
}

/**
 * A short red wash when we take a hit — the cheapest possible "that hurt".
 *
 * One-shot CSS keyed on the hit count, the same shape as the race's GO flash:
 * a new `tick` remounts the element, which replays the animation. The earlier
 * version drove it from state and a timeout, which meant a setState in an
 * effect body — a cascading render for something the browser animates on its
 * own, and the reduced-motion block in globals.css already covers.
 */
function HurtFlash({ tick }: { tick: number }) {
  if (tick === 0) return null;
  return (
    <div
      key={tick}
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-red-600/30"
      style={{ animation: "hurtFlash 420ms ease-out forwards" }}
    />
  );
}
