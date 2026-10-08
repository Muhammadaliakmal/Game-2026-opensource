# Phase 11 — Party: play together on the same Wi-Fi

The ask: people on the same internet connection play together, in every game
that can be played together.

## No server

There is no room server to rely on (the Render one is suspended), and the
point of "same Wi-Fi" is that the devices are next to each other anyway. So:

- **Play is browser to browser.** WebRTC data channels, every member to
  every other. On one Wi-Fi that is a hop across the router.
- **The introduction goes over public relays.** Two browsers must swap a few
  hundred bytes before WebRTC can connect; Trystero carries that over public
  Nostr relays, encrypted with the party code.
- **The host's browser is the authority.** It holds the `Party`; guests send
  it their scores; it sends everyone snapshots. If it leaves, the
  longest-standing member inherits (`PartySession`).

## What "same internet" can mean in a browser

A page cannot scan a LAN. What everyone behind one router shares is the
**public address** the internet sees, and a browser learns its own from a
public STUN server — the same lookup every WebRTC call makes.

- **IPv4**: one router, one address.
- **IPv6**: one home network is one /64, so v6 is cut to four groups.
- **Mobile data** next to you is a different network; that is what the code
  is for.
- **STUN blocked** (some school/office Wi-Fi): no lobby, codes only.

The address is hashed into a lobby name; hosts announce their party there.

## The pieces

| Piece | Where | What |
|---|---|---|
| `Party` | `src/lib/party.ts` | Pure rules: members, host, phase, round, scores, snapshot/restore. |
| `PartySession` | `src/lib/net/party-session.ts` | Pure: who hosts, joins, leaves, succession, collisions. |
| transport | `src/lib/net/party.ts` | Trystero rooms (party + network lobby), mirrored into `party-store`. |
| nearby | `src/lib/net/nearby.ts` | STUN → public address → lobby name. |
| `PARTY_GAMES` | `src/lib/party-games.ts` | Which cabinets, and how (`score` / `seats` / `duel`). |
| `/party` | `src/app/party/` | Start, nearby list, join by code, lobby. |

## Modes, by game — all built 8 Oct 2026

### Score versus (11B)

Chunk Runner, Tower Stack, Gravity Shift, One Bullet, SwarmRush, Reflex,
Untwine, ECHO. Every one is a function of its seed, so a round is one seed for
everyone: same course, live scoreboard, standings, rematch. No continue or
restart mid-round. Payout untouched.

### Seats (11C): Ludo, Snakes & Ladders

The host's turn machine is the match: it runs the bots and the turn clocks and
announces each decision (`onDecision`: the die as the throw starts, each move
as it is played). Every other table is a puppet (`puppet: true`) that replays
them as its own phases reach them — pacing stays local, decisions do not.
`turn-net.test.ts` plays whole matches both ways and requires identical
states. Guest taps are requests the host plays if it is their turn
(`host/board-net.ts`). Seats are the first four members in join order; bots
fill the rest; the host plays for anyone who leaves. A networked match ends
for everyone at match-over.

### Duel (11D): Ragdoll Rumble

Not lockstep — `Math.sin` may round differently in Chrome and Safari. The host
simulates with the guest's stick as player two and sends a snapshot every step
(`duel/net.ts`); the guest's own `Match` is written from it, so the renderer
and sounds run unchanged. One seated player fights the CPU.

### 3D (11E): the bike race and parkour

**Race** (`lib/net/race.ts`): serverless now. The browser that opens a race
runs `Race` (moved to `lib/race-rules.ts`; the server re-exports it) and the
CPU riders, and sends the state at 15 Hz; riders send their position. Each
rider builds the track from its id. **CPU riders** (`lib/race-cpu.ts`): Easy,
Medium, Hard — they ride the centreline by distance, brake for corners, ride
the terrain, and Hard boosts on straights. Race the CPU alone (`?cpu=&bots=`)
or fill a friends' grid's empty slots when the lights arm (`?cpu=`). `RACE`
is on.

**Parkour together** (`lib/net/together.ts`): `/play/<course>?together=CODE`
— positions go browser to browser into the peer map `Peers.tsx` already
draws, and finish times to a board under the run clock (`TogetherChip`).

**From a party**, the host sends everyone to either (`Party.go`).

## Not doing

- No TURN relay. Two networks that block direct connections cannot play;
  on one Wi-Fi that does not come up.
- No race payout. The room server paid race places; a browser cannot be
  trusted to report its own, so serverless races pay nothing.
- No host handover mid-race or mid-board-match. The match lives in the
  host's tab; if it closes, the round ends.
- No party chat. Everyone is in the same room, physically.
- No new payout. See above.
