# Ragdoll Rumble — the duel cabinet

The source brief was "Ragdoll Rumble: Implementation Plan for a Physics-Based
2D Stick Duel Game" (v1.0). This file records what was built from it, in what
order, and what was decided against it. The code is `src/arcade/games/duel/`;
the art is the asset pack in `assets/duel/` (see its README).

## Decisions against the brief

| Brief | Built | Why |
|---|---|---|
| Phaser 4 + Matter.js | The arcade host plus a hand-written position-based ragdoll | Every cabinet already has a fixed 1/60 loop, seeded RNG, input, sound and payout (`arcade/host/`). The duel is two 12-particle bodies, and a stick is a length rather than a stiffness, so it cannot explode. It adds no dependency, and it is deterministic, which Matter is not. |
| `/duel` route with its own engine folder | Ninth cabinet: `games/duel/` + one row in `arcade/registry.ts` | "Adding a game is one folder and one row." The guide page is `/games/duel`, from `content/cabinet-notes.ts`, like every cabinet. |
| Flick up to jump | JUMP button (Space / Enter) | The backswing of every overhead chop *is* a fast upward flick, so a flick gesture would jump on every other swing. |
| Eight weapons, four arenas | Rebar and Pylon Maul; Magma Gauntlet | Rebar and Maul are the same rules with different numbers. Hook, shield, sling and prod each need rules of their own. The other three arenas are in `assets/duel/` waiting for their hazards. |
| Service-worker entry for the duel | Art is imported statically | The worker caches `/_next/static/`. A static import lands there, so the cabinet works offline with its art. `public/duel/` would have needed a new allowlist entry. |
| H5 Games Ads (`adBreak`) | Not built | It is by application, and the Android app declares no ads (`lib/app-mode.ts`). It can be added when Google approves the account. |

## Steps

1. **Multi-touch in the host.** `InputState.touches`, tracked by `pointerId`,
   with the same one-step floor as `pointer` (`host/input.ts`,
   `input.test.ts`). Two thumbs on one phone had been one pointer.
2. **Tuning and arena.** `tuning.ts` (every number; `S` scales the
   fighter against the pack's art), `arena.ts` (Magma Gauntlet from the
   pack's JSON, one-way thin platforms, the moving bridge, the lava beat).
3. **Active ragdoll.** `ragdoll.ts`: momentum-conserving muscles, standing,
   walking, jumping, stagger and recovery, knockout.
4. **Combat.** `combat.ts`: damage is relative impact speed × weapon ×
   location, with knockback, stagger, weapon clashes, stamina and the heavy
   wind-up.
5. **Match.** `match.ts`: best of three, a 60 s clock judged on health,
   the lava beat, a cap on drawn rounds, `scoreFor`.
6. **CPU.** `ai.ts`: delayed perception, cadence, aim error. Crossing gaps
   and footing are shared by every tier; only Medium and Hard know the beat.
7. **Controls.** `controls.ts`: dynamic sticks (one per half in versus),
   JUMP / SKILL buttons, split keyboard, the menu.
8. **Render.** `render.ts` + `sprites.ts`: the pack's robots on the
   skeleton, tinted once, and the vector fallback. `index.ts` holds the juice
   (hit-stop, shake, slow-mo KO, bursts), all dropped under reduced motion.
9. **Tests.** Five files, 34 tests. The ladder test plays tiers against
   each other, and a CPU has to cross the lava to reach an opponent who
   will not come to it.
10. **Site wiring.** Arcade registry, payout rate, content registry, guide
    notes, shelf art. The arcade page's counts went from nine to ten.

## Measured (fixed seeds, sides alternating)

- Medium beats Easy 10–2, Hard beats Medium 8–4, Hard beats Easy 9–3.
- About half of rounds end in the lava. Before two AI fixes it was nearly
  all of them: the CPU jumped at a robot standing on the far lip, and it
  swung with its recoil at a platform's edge.

## Not done

- H5 ads (see above).
- Gamepads, remappable keys, the handedness toggle, a fixed-stick option.
- Cosmetics from the pack (twelve hats, six colours) and the shop entries
  for them.
- The remaining six weapons and three arenas.
- Win-rate telemetry from real players. The ladder above is CPU against
  CPU, not CPU against people.
