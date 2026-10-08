"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { entryFor } from "@/arcade/registry";
import { isMatchCode, makeMatchCode, normalizeMatchCode } from "@/lib/match-code";
import { watchNearby, type NearbyParty } from "@/lib/net/party";
import { markPartyCreator } from "@/components/party/creator";
import { PARTY_GAMES, PARTY_MAX } from "@/lib/party-games";

/**
 * The party lobby: start one, see the ones on your Wi-Fi, or type a code.
 *
 * "On your Wi-Fi" is every browser that shares this network's public
 * address, met in a lobby named after it (`lib/net/nearby.ts`). No server of
 * ours is involved. A phone on mobile data beside you is on a different
 * network as far as anything can tell, which is why the code is always there.
 */

export default function PartyHomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  /* undefined while looking, null if this network cannot be identified. */
  const [nearby, setNearby] = useState<NearbyParty[] | null | undefined>(undefined);

  useEffect(() => watchNearby(setNearby), []);

  const start = () => {
    const code = makeMatchCode();
    markPartyCreator(code);
    router.push(`/party/${code}`);
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMatchCode(code)) router.push(`/party/${normalizeMatchCode(code)}`);
  };

  const ready = PARTY_GAMES.filter((g) => g.ready).length;

  return (
    <PageShell width="prose">
      <header className="flex flex-col gap-2">
        <Link href="/games" className="hud-label text-accent w-fit">
          ← Games
        </Link>
        <h1 className="text-display text-ink font-bold">Party</h1>
        <p className="text-dim max-w-md text-sm">
          Everyone in the room, on the same Wi-Fi, playing the same game at once. The host picks a
          cabinet, everyone gets the same course, and the scores go up side by side. Up to{" "}
          {PARTY_MAX} players, {ready} games so far.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-ink text-sm font-semibold">Start a party</h2>
        <p className="text-dim text-xs">
          Anyone on your Wi-Fi will see it below on their own screen. Anyone else can join with the
          code.
        </p>
        <button type="button" onClick={start} className="hud-chip hud-chip--primary w-fit">
          Start a party
        </button>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-live="polite">
        <h2 className="text-ink text-sm font-semibold">On your Wi-Fi</h2>
        {nearby === undefined ? (
          <p className="text-dim text-xs">Looking…</p>
        ) : nearby === null ? (
          <p className="text-dim text-xs">
            This network will not say where it is (some school and office Wi-Fi blocks it), so
            parties here cannot find each other on their own. Use a code instead.
          </p>
        ) : nearby.length === 0 ? (
          <p className="text-dim text-xs">
            No parties on this network yet. Start one, or ask whoever has one open to check you are
            on the same Wi-Fi — mobile data counts as somewhere else.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {nearby.map((p) => (
              <li key={p.code}>
                <Link
                  href={`/party/${p.code}`}
                  className="card hover:border-accent flex items-center justify-between gap-3 p-3 transition"
                >
                  <span className="min-w-0">
                    <span className="text-ink block truncate text-sm font-semibold">
                      {p.host || "A party"}&rsquo;s party
                    </span>
                    <span className="text-dim block text-xs">
                      {p.players} {p.players === 1 ? "player" : "players"}
                      {p.game ? ` · ${entryFor(p.game)?.title ?? p.game}` : ""}
                      {p.phase === "playing" ? " · round on" : ""}
                    </span>
                  </span>
                  <span className="hud-chip hud-chip--primary shrink-0">Join</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-ink text-sm font-semibold">Join with a code</h2>
        <form onSubmit={join} className="flex flex-wrap items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(normalizeMatchCode(e.target.value))}
            placeholder="Code"
            aria-label="Party code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="bg-surface text-ink num placeholder:text-dim/50 w-40 rounded-[var(--radius)] px-3 py-2 text-sm tracking-widest ring-1 ring-white/10"
          />
          <button type="submit" disabled={!isMatchCode(code)} className="hud-chip hud-chip--primary">
            Join
          </button>
        </form>
      </section>

      <section className="card flex flex-col gap-2 p-5">
        <h2 className="text-ink text-sm font-semibold">How a round works</h2>
        <ul className="text-dim flex list-disc flex-col gap-1.5 pl-4 text-xs">
          <li>Every player gets the same seed, so the same blocks, gaps and spawns.</li>
          <li>Scores update live in the corner while you play. Highest score wins the round.</li>
          <li>There is no continue and no restart mid-round. The host can call a rematch.</li>
          <li>Each run still pays coins as it would on its own.</li>
          <li>
            Phones connect to each other directly. The host&rsquo;s phone keeps the party: if it
            leaves, the next player takes over.
          </li>
        </ul>
      </section>
    </PageShell>
  );
}
