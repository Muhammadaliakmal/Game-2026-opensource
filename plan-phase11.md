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

## Modes, by game

### 11A + 11B — score versus (built 8 Oct 2026, verified locally in two browsers)

Chunk Runner, Tower Stack, Gravity Shift, One Bullet, SwarmRush, Reflex,
Untwine, ECHO.

Every one of these is a function of its seed (`GameHost` builds `rng` from
`useArcade.seed`, and `Math.random` is banned in a game module). So a versus
round is: the host presses Start, the room picks one seed, and every member
opens the same cabinet with it. Same course, same blocks, same spawns.

- Live scores stream to the room at most 4 Hz; the overlay shows a strip of
  everyone's running number.
- A member's run ending is a `done` with the final score. When every
  participant is done the room publishes standings.
- **No continue, no restart** inside a round: a rewarded continue or an R
  restart (which rerolls the seed) would make it a different contest. Again
  becomes "back to lobby" / the host's Rematch.
- Payout is untouched: the run pays like any run, from the same daily pool.
  A party is not a coin multiplier.
- Someone joining mid-round watches the scoreboard and plays the next round.

### 11C — seats (Ludo, Snakes & Ladders)

Host-authoritative. The host's browser runs the turn machine with remote
humans in seats that would have been bots; empty seats stay bots. Clients send
intents (`roll`, `move i`), the host broadcasts resolved events. The turn
machine already returns events and never touches a pixel (`rules.ts`), which
is exactly what makes this possible.

### 11D — duel (Ragdoll Rumble)

`match.step(dt, in0, in1)` is already a two-input simulation. The host runs
it; the guest sends its input every step over the party's data channel and
draws the host's snapshots. On one Wi-Fi that is a few milliseconds.

### 11E — the 3D modes

Both run through the room server today, which is down. Doing them without it
means moving peer presence onto the party's data channels.

## Not doing

- No TURN relay. Two networks that block direct connections cannot play;
  on one Wi-Fi that does not come up.
- No party chat. Everyone is in the same room, physically.
- No new payout. See above.
