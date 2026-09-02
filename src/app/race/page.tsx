"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isMatchCode, makeMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { multiplayerEnabled } from "@/lib/net/room";
import { MAX_RIDERS, RACE_LAPS } from "@/lib/race-track";

/**
 * The race lobby: open a grid, or join one somebody sent you.
 *
 * No public list of open races, for the same reason the match lobby has none: a
 * code you were given is the whole access model, and it keeps a race between
 * the people who meant to have one.
 *
 * There is no world picker either. A lap counter needs a closed circuit with
 * known sectors, and exactly one world has them.
 */
export default function RaceLobbyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const open = () => router.push(`/race/${makeMatchCode()}`);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatchCode(code)) return;
    router.push(`/race/${normalizeMatchCode(code)}`);
  };

  return (
    <main className="bg-steel-900 min-h-dvh px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link href="/" className="hud-label w-fit">
            ← Blockworld
          </Link>
          <h1 className="text-steel-050 text-2xl font-semibold">Races</h1>
          <p className="text-steel-200 text-sm">
            Up to {MAX_RIDERS} riders, {RACE_LAPS} laps of Neon Circuit, on
            bikes. Open a grid and send the link to whoever you want to race.
          </p>
        </header>

        {!multiplayerEnabled && (
          <p className="card border-signal/40 text-steel-200 p-4 text-xs">
            Races need the room server running.{" "}
            <span className="num">NEXT_PUBLIC_MULTIPLAYER_URL</span> is not set,
            so opening one here will not connect.
          </p>
        )}

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-steel-050 text-sm font-semibold">Open a grid</h2>
          <p className="text-steel-200 text-xs">
            You get a code to share. The lights start on their own once a second
            rider arrives, or you can go out alone for a time trial.
          </p>
          <button onClick={open} className="hud-chip hud-chip--primary w-fit">
            Open a race
          </button>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-steel-050 text-sm font-semibold">Join a race</h2>
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
              className="bg-steel-800 text-steel-050 num placeholder:text-steel-200/50 w-40 rounded-[var(--radius)] px-3 py-2 text-sm tracking-widest ring-1 ring-white/10"
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
          <h2 className="text-steel-050 text-sm font-semibold">Riding</h2>
          <ul className="text-steel-200 flex flex-col gap-1.5 text-xs">
            <li>
              <span className="num">W</span> / <span className="num">↑</span>{" "}
              throttle, <span className="num">S</span> reverse
            </li>
            <li>
              <span className="num">A</span> <span className="num">D</span> steer,{" "}
              <span className="num">Space</span> brake
            </li>
            <li>On a phone: the stick steers, GO and BRAKE are on the right.</li>
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
