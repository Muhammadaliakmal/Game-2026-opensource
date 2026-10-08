"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { entryFor } from "@/arcade/registry";
import { useArcade } from "@/arcade/store";
import { joinParty, leaveParty, partyGo, partyPick, partyStart, partyToLobby } from "@/lib/net/party";
import { makeMatchCode } from "@/lib/match-code";
import { markRaceHost } from "@/lib/race-host";
import { CPU_DIFFICULTIES, type CpuDifficulty } from "@/lib/race-cpu";
import { MAX_RIDERS } from "@/lib/race-track";
import { PARKOUR_META } from "@/lib/world-list";
import { PARTY_GAMES, PARTY_MAX, partyGame, rankScores, type Ranked } from "@/lib/party-games";
import { selectIsHost, usePartyStore, type PartyMemberView } from "@/stores/party-store";
import { PartyBridge } from "./PartyBridge";
import { isPartyCreator, markPartyCreator, takePartyGame } from "./creator";

const ArcadeOverlay = dynamic(() => import("@/arcade/host/ArcadeOverlay"), { ssr: false });

/**
 * A party's room: who is here, what the host picked, and the start button.
 *
 * The cabinet opens over this page when a round starts (`PartyBridge`), and
 * closing it lands back here — so this page is the party, and the overlay is
 * a round of it.
 */
export function PartyLobby({ code }: { code: string }) {
  const router = useRouter();
  const status = usePartyStore((s) => s.status);
  const error = usePartyStore((s) => s.error);
  const members = usePartyStore((s) => s.members);
  const selfId = usePartyStore((s) => s.selfId);
  const hostId = usePartyStore((s) => s.hostId);
  const phase = usePartyStore((s) => s.phase);
  const game = usePartyStore((s) => s.game);
  const isHost = usePartyStore(selectIsHost);
  const activeGame = useArcade((s) => s.activeGame);

  useEffect(() => {
    void joinParty(code, { creator: isPartyCreator(code) });
    return () => leaveParty();
  }, [code]);

  /*
   * Where the host sends everyone (`Party.go`). Followed by every member,
   * the host included, the moment it changes — but not on arrival: a link the
   * party already took before you joined is not one to follow now.
   */
  const go = usePartyStore((s) => s.go);
  const [goSeen, setGoSeen] = useState<number | null>(null);
  if (status === "live" && goSeen === null) setGoSeen(go.n);
  useEffect(() => {
    if (goSeen === null || go.n <= goSeen || !go.href) return;
    router.push(go.href);
  }, [go, goSeen, router]);

  // Started from a cabinet's "Compete nearby": pick that game once we host.
  useEffect(() => {
    if (status !== "live" || !isHost) return;
    const wanted = takePartyGame(code);
    if (wanted) partyPick(wanted);
  }, [status, isHost, code]);

  const hostIt = () => {
    markPartyCreator(code);
    void joinParty(code, { creator: true });
  };

  const leave = () => {
    leaveParty();
    router.push("/party");
  };

  const me = members.find((m) => m.id === selfId);
  const picked = game ? entryFor(game) : undefined;
  const standings = rankScores(members.filter((m) => m.playing));

  return (
    <PageShell width="prose">
      <PartyBridge />
      <header className="flex flex-col gap-2">
        <Link href="/party" className="hud-label text-accent w-fit">
          ← Party
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-display text-ink font-bold">Party</h1>
          <ShareCode code={code} />
        </div>
      </header>

      {status === "connecting" && (
        <p className="card text-dim p-4 text-sm" role="status">
          Finding the party… phones introduce themselves first, which takes a few seconds.
        </p>
      )}

      {status === "nohost" && (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-ink text-sm font-semibold">Nobody is hosting {code} right now.</p>
          <p className="text-dim text-xs">
            The party may have ended, or the host is on a network that blocks direct connections.
            You can host it yourself and send the code round again.
          </p>
          <div className="flex gap-2">
            <button type="button" className="hud-chip hud-chip--primary" onClick={hostIt}>
              Host this party
            </button>
            <button
              type="button"
              className="hud-chip"
              onClick={() => void joinParty(code, { creator: false })}
            >
              Keep waiting
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-danger text-sm font-semibold">{error}</p>
          <button
            type="button"
            className="hud-chip w-fit"
            onClick={() => void joinParty(code, { creator: isPartyCreator(code) })}
          >
            Try again
          </button>
        </div>
      )}

      {status === "live" && (
        <>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-ink text-sm font-semibold">
              Players <span className="text-dim num font-normal">{members.length}/{PARTY_MAX}</span>
            </h2>
            <ul className="flex flex-wrap gap-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className={`hud-chip text-sm ${m.id === selfId ? "ring-accent ring-1" : ""}`}
                >
                  {m.id === hostId && (
                    <span className="text-accent" aria-label="host" title="Host">
                      ★
                    </span>
                  )}
                  {m.name}
                  {m.id === selfId && <span className="text-dim">(you)</span>}
                </li>
              ))}
            </ul>
            {members.length < 2 && (
              <p className="text-dim text-xs">
                Waiting for someone else. Anyone on this Wi-Fi sees this party on their Party page,
                or send them the code.
              </p>
            )}
          </section>

          {phase === "playing" && (
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-ink text-sm font-semibold">
                Round on: {picked?.title ?? game}
              </h2>
              {me && !me.playing && (
                <p className="text-dim text-xs">
                  {partyGame(game)?.seats
                    ? `${picked?.title ?? "This game"} seats ${partyGame(game)?.seats}, and the table is full this round. You are watching.`
                    : "You arrived mid-round. You are in the next one."}
                </p>
              )}
              {me?.playing && !me.done && !activeGame && (
                <button
                  type="button"
                  className="hud-chip hud-chip--primary w-fit"
                  onClick={() => useArcade.getState().open(game, usePartyStore.getState().seed, { versus: true })}
                >
                  Back into the round
                </button>
              )}
              <Standings rows={standings} selfId={selfId} placesOnly={partyGame(game)?.kind !== "score"} />
            </section>
          )}

          {phase === "results" && (
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-ink text-sm font-semibold">Last round: {picked?.title ?? game}</h2>
              <Standings rows={standings} selfId={selfId} placesOnly={partyGame(game)?.kind !== "score"} />
              {isHost && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="hud-chip hud-chip--primary" onClick={partyStart}>
                    Rematch
                  </button>
                  <button type="button" className="hud-chip" onClick={partyToLobby}>
                    Pick another game
                  </button>
                </div>
              )}
            </section>
          )}

          {phase !== "playing" && isHost && <Together3D code={code} players={members.length} />}

          {phase !== "playing" && !isHost && (
            <p className="text-dim text-xs">
              The host can also take everyone to the bike race or a parkour course — you will be
              moved there automatically.
            </p>
          )}

          {phase !== "playing" && (
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-ink text-sm font-semibold">
                {isHost ? "Pick a game" : picked ? `The host picked ${picked.title}` : "The host is picking a game"}
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PARTY_GAMES.map((g) => {
                  const e = entryFor(g.id);
                  if (!e) return null;
                  const on = g.id === game;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        disabled={!isHost || !g.ready}
                        onClick={() => partyPick(g.id)}
                        aria-pressed={on}
                        style={{ ["--card-hue" as string]: e.hue }}
                        className={`card flex h-full w-full flex-col gap-0.5 p-3 text-left transition ${
                          on ? "border-accent ring-accent/40 ring-1" : "border-[var(--border-color)]"
                        } ${g.ready ? "" : "opacity-50"} ${isHost && g.ready ? "hover:border-accent" : ""}`}
                      >
                        <span className="text-ink text-sm font-semibold">{e.title}</span>
                        <span className="text-dim text-xs">{g.ready ? e.tagline : "Coming soon"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {isHost && (
                <button
                  type="button"
                  className="hud-chip hud-chip--primary w-fit"
                  disabled={!game}
                  onClick={partyStart}
                >
                  {game ? `Start ${picked?.title ?? ""}` : "Pick a game to start"}
                </button>
              )}
            </section>
          )}
        </>
      )}

      <button type="button" className="hud-chip w-fit" onClick={leave}>
        Leave party
      </button>

      {activeGame && <ArcadeOverlay />}
    </PageShell>
  );
}

function Standings({
  rows,
  selfId,
  placesOnly,
}: {
  rows: Ranked<PartyMemberView>[];
  selfId: string | null;
  placesOnly: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map(({ row, place }) => (
        <li key={row.id} className="flex items-center gap-3 text-sm">
          <span className="num text-dim w-6">{place}.</span>
          <span className="text-ink min-w-0 flex-1 truncate">
            {row.name}
            {row.id === selfId && <span className="text-dim"> (you)</span>}
          </span>
          {!placesOnly && <span className="num font-semibold">{row.score}</span>}
          <span className="text-dim w-4 text-xs">{row.done ? "✓" : "…"}</span>
        </li>
      ))}
    </ol>
  );
}

/** The code, big enough to read across a room, and a button that shares the link. */
function ShareCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/party/${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Join my party", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* Dismissed. Nothing to do. */
    }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="hud-label">Code</span>
      <span className="num text-ink text-2xl font-bold tracking-[0.2em]">{code}</span>
      <button type="button" className="hud-chip" onClick={share}>
        {copied ? "Copied" : "Share"}
      </button>
    </div>
  );
}

/**
 * The 3D modes, for the whole party at once. The host picks; everyone is sent
 * (`Party.go`). The race is hosted by the host's browser, so it is marked as
 * theirs before the link goes out; a course is played together on the party's
 * own code (`?together=`).
 */
function Together3D({ code, players }: { code: string; players: number }) {
  const [fill, setFill] = useState<CpuDifficulty | "off">("medium");
  const [course, setCourse] = useState(PARKOUR_META[0]?.slug ?? "parkour");

  const race = () => {
    const raceCode = makeMatchCode();
    markRaceHost(raceCode);
    const q = new URLSearchParams({ riders: String(Math.min(MAX_RIDERS, players)) });
    if (fill !== "off") q.set("cpu", fill);
    partyGo(`/race/${raceCode}?${q}`);
  };
  const run = () => partyGo(`/play/${course}?together=${code}`);

  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-ink text-sm font-semibold">Ride and run together</h2>
      <p className="text-dim text-xs">
        Takes everyone here to the same 3D game. Race grids hold {MAX_RIDERS}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="hud-label">Bike race · empty slots</span>
        {(["off", ...CPU_DIFFICULTIES] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFill(d)}
            aria-pressed={fill === d}
            className={`hud-chip text-xs capitalize ${fill === d ? "hud-chip--primary" : ""}`}
          >
            {d === "off" ? "None" : `CPU ${d}`}
          </button>
        ))}
        <button type="button" className="hud-chip hud-chip--primary" onClick={race}>
          Race on bikes
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="hud-label" htmlFor="party-course">
          Parkour course
        </label>
        <select
          id="party-course"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className="bg-surface text-ink rounded-[var(--radius)] px-2 py-1.5 text-sm ring-1 ring-white/10"
        >
          {PARKOUR_META.map((w) => (
            <option key={w.slug} value={w.slug}>
              {w.name}
              {w.tier ? ` · ${w.tier}` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="hud-chip hud-chip--primary" onClick={run}>
          Run it together
        </button>
      </div>
    </section>
  );
}
