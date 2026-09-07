"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isMatchCode, makeMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { multiplayerEnabled } from "@/lib/net/room";
import { MAX_RIDERS, RACE_LAPS, RACE_TRACKS } from "@/lib/race-track";
import { ModeCover } from "@/components/modes/ModeCover";

/**
 * The race lobby: open a grid, or join one somebody sent you.
 *
 * No public list of open races, for the same reason the match lobby has none: a
 * code you were given is the whole access model, and it keeps a race between
 * the people who meant to have one.
 *
 * The track picker only sets a `?track=` on the link the creator opens — every
 * track shares the sector scheme, so the joiner races whatever was built and
 * the lap counter never has to care which one it is.
 */
export default function RaceLobbyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [track, setTrack] = useState(RACE_TRACKS[0].id);

  const open = () => {
    const q = track === RACE_TRACKS[0].id ? "" : `?track=${track}`;
    router.push(`/race/${makeMatchCode()}${q}`);
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatchCode(code)) return;
    router.push(`/race/${normalizeMatchCode(code)}`);
  };

  return (
    // Rebinds --color-accent to the racing magenta for the whole screen, the
    // same mechanism the in-game HUD uses. See globals.css.
    <main data-mode="race" className="bg-base min-h-dvh px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        {/* The same cover the home page shows, at full width.
            Arriving here used to mean a heading and two sentences, which made
            the mode feel like a form to fill in — and the picture is what
            carries the promise from the tile that was pressed to the screen
            that opens. */}
        <header className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border-color)]">
          <div className="relative h-44 w-full sm:h-56">
            <ModeCover art="race" />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(2,3,10,0.94) 0%, rgba(2,3,10,0.7) 38%, rgba(2,3,10,0.1) 72%, rgba(2,3,10,0) 100%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5">
              <Link href="/" className="hud-label text-accent w-fit">
                ← Blockworld
              </Link>
              <h1 className="text-display text-ink font-bold">Race</h1>
              <p className="text-dim max-w-md text-sm">
                Up to {MAX_RIDERS} riders, {RACE_LAPS} laps, on bikes. Pick a
                track, open a grid, and send the link to whoever you want to
                race.
              </p>
            </div>
          </div>
        </header>

        {!multiplayerEnabled && (
          <p className="card border-accent/40 text-dim p-4 text-xs">
            Races need the room server running.{" "}
            <span className="num">NEXT_PUBLIC_MULTIPLAYER_URL</span> is not set,
            so opening one here will not connect.
          </p>
        )}

        <section className="card flex flex-col gap-4 p-5">
          {/* "Open a grid" was jargon. A grid is the thing you stand on at the
              start of a race, and nobody arriving here to play with a friend
              was looking for one — they were looking for a room to race in. */}
          <h2 className="text-ink text-sm font-semibold">Create a room to race</h2>
          <p className="text-dim text-xs">
            You get a code to share. The lights start on their own once a second
            rider arrives, or you can go out alone for a time trial.
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="hud-label mb-1">Track</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {RACE_TRACKS.map((t) => {
                const on = t.id === track;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTrack(t.id)}
                    aria-pressed={on}
                    className={`card flex-1 p-3 text-left transition ${
                      on
                        ? "border-accent ring-accent/40 ring-1"
                        : "border-[var(--border-color)] opacity-70 hover:opacity-100"
                    }`}
                  >
                    <span className="text-ink block text-sm font-semibold">
                      {t.name}
                    </span>
                    <span className="text-dim mt-0.5 block text-xs">
                      {t.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button onClick={open} className="hud-chip hud-chip--primary w-fit">
            Create the room
          </button>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-ink text-sm font-semibold">Join a race</h2>
          <form onSubmit={join} className="flex flex-wrap items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizeMatchCode(e.target.value))}
              placeholder="Code"
              aria-label="Race code"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="bg-surface text-ink num placeholder:text-dim/50 w-40 rounded-[var(--radius)] px-3 py-2 text-sm tracking-widest ring-1 ring-white/10"
            />
            <button
              type="submit"
              disabled={!isMatchCode(code)}
              className="hud-chip hud-chip--primary"
            >
              Join
            </button>
          </form>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-ink text-sm font-semibold">Riding</h2>
          <ul className="text-dim flex flex-col gap-1.5 text-xs">
            <li>
              <span className="num">W</span> / <span className="num">↑</span>{" "}
              throttle, <span className="num">S</span> reverse
            </li>
            <li>
              <span className="num">A</span> <span className="num">D</span> steer,{" "}
              <span className="num">Space</span> brake
            </li>
            <li>
              On a phone: the two pads on the left steer, GO and BRAKE are on
              the right. Other schemes — a stick, tilt, or the assist — are
              under Settings.
            </li>
            <li>
              Cutting the corner does not help — the lap only counts if you go
              round.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
