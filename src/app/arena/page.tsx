"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";
import { isMatchCode, makeMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { multiplayerEnabled } from "@/lib/net/room";

/**
 * The match lobby: open a room, or join one somebody sent you.
 *
 * No public list of open matches. A code you were given is the whole access
 * model — it keeps a duel between the two people who meant to have one, and it
 * means nobody can be dropped into a fight with a stranger who found them in a
 * browser. SPEC §10's caution about who this genre is for applies here as much
 * as it does to comments.
 */
export default function ArenaLobbyPage() {
  const router = useRouter();
  const [worldId, setWorldId] = useState(BUILT_IN_WORLDS[0].slug);
  const [code, setCode] = useState("");

  const open = () => {
    router.push(`/arena/${makeMatchCode()}?world=${worldId}`);
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatchCode(code)) return;
    router.push(`/arena/${normalizeMatchCode(code)}`);
  };

  return (
    <main className="bg-steel-900 min-h-dvh px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link href="/" className="hud-label w-fit">
            ← Blockworld
          </Link>
          <h1 className="text-steel-050 text-2xl font-semibold">Matches</h1>
          <p className="text-steel-200 text-sm">
            Two players, one world. Land five knockdowns to win. Open a match and
            send the link to whoever you want to fight.
          </p>
        </header>

        {!multiplayerEnabled && (
          <p className="card border-signal/40 text-steel-200 p-4 text-xs">
            Matches need the room server running.{" "}
            <span className="num">NEXT_PUBLIC_MULTIPLAYER_URL</span> is not set, so
            opening one here will not connect.
          </p>
        )}

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-steel-050 text-sm font-semibold">Open a match</h2>
          <div className="flex flex-col gap-2">
            <span className="hud-label">Fight in</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {BUILT_IN_WORLDS.map((w) => (
                <button
                  key={w.slug}
                  onClick={() => setWorldId(w.slug)}
                  aria-pressed={worldId === w.slug}
                  className={`card flex flex-col items-start gap-1 p-3 text-left transition ${
                    worldId === w.slug ? "border-signal" : "hover:border-steel-500"
                  }`}
                >
                  <span className="text-steel-050 text-xs font-medium">{w.name}</span>
                  <span className="text-steel-200 text-2xs">{w.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="hud-chip hud-chip--primary w-fit" onClick={open}>
            Open match
          </button>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-steel-050 text-sm font-semibold">Join with a code</h2>
          <form onSubmit={join} className="flex flex-wrap items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizeMatchCode(e.target.value))}
              placeholder="ABC234"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Match code"
              className="bg-steel-900 border-steel-500 text-steel-050 num focus:border-signal w-40 rounded border px-3 py-2 text-sm tracking-[0.3em] uppercase outline-none"
            />
            <button className="hud-chip" disabled={!isMatchCode(code)}>
              Join match
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
