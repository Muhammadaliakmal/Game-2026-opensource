# The Play Console, filled in

Everything the Play Console asks for that can be answered from this repo,
answered from it. Written 22 September 2026 for the Capacitor app
(`com.specdrivengames.app`); the TWA (`com.specdrivengames.twa`) gets the same
answers on its own listing, with the one difference marked under Ads.

Every number and claim here came from the code. If one stops being true, fix
it here in the same commit — a Data safety form that disagrees with the app is
a policy violation, not a typo.

---

## Store listing

| Field | Limit | Value |
|---|---|---|
| App name | 30 | `Spec Driven Games` |
| Short description | 80 | `Voxel parkour with ghosts and medals, plus nine quick arcade games. No ads.` |
| App icon | 512×512 PNG | `capacitor-android/store_icon.png` (generated, `npm run cap:assets`) |
| Feature graphic | 1024×500 | `capacitor-android/feature_graphic.png` (generated, same command) |
| Phone screenshots | 2–8 | **Not generated.** Must be real gameplay — see below |
| Category | | Games → Action |
| Contact email | | `privacy@specdrivengames.com` |
| Website | | `https://specdrivengames.com` |
| Privacy policy | | `https://specdrivengames.com/privacy` |

### Full description

```
Spec Driven Games is a voxel game you build and play in the same place.

PARKOUR — 23 hand-made courses across six tiers, from a first jump to Magma
Gauntlet, a course built over a sheet of lava. Every course is proven
finishable by a route solver before it ships, and every time you set is
raced by your own ghost the next time you run it. Medals are measured
against the course's own fastest possible route.

ARCADE — nine short cabinets: Chunk Runner, Tower Stack, Ludo, Snakes &
Ladders, ECHO, Gravity Shift, One Bullet, SwarmRush and Reflex.

You can play without an account. Sign in to keep your times, coins and
medals. There are no ads in the app and nothing to buy with real money.
```

Two modes are left out because `src/lib/features.ts` switches them off, and a
listing must not promise what the app hides. When `RACE` is back on (it needs
a deployed room server), add after PARKOUR: "RACING — two bike tracks, raced
live against other players. Share a code and whoever has it joins the same
grid." When `UGC` is on, add "BUILD — place blocks, paint them, mark a finish
and checkpoints, and your world becomes a course with its own leaderboard."

Check before pasting: `COURSE_COUNT` in `src/content/registry.ts`,
`RACE_TRACKS` in `src/lib/race-track.ts`, `CABINETS` in `src/arcade/registry.ts`.

### Screenshots

Play requires real gameplay here, and the generated covers in `public/covers/`
are level cards, not screenshots. Capture on a phone in landscape (the
manifest locks landscape), 16:9, at least 1080 px tall. Four that show the
modes that are switched on: two parkour runs with the HUD (an early course
and Magma Gauntlet), and two arcade cabinets.

---

## App content

### Account deletion

Required, because the app lets people create an account.

- **Delete account URL:** `https://specdrivengames.com/account/delete`
- **In-app path:** avatar menu → *Delete account*.
- **What is deleted:** the Clerk user; their `players` row; their `runs`;
  their `worlds`, and every run on those worlds (`src/lib/db/account.ts`).
- **What is kept:** nothing.

**Turn off Clerk's own deletion** (Clerk dashboard → User & authentication →
Restrictions → *Allow users to delete their accounts*). Clerk's button deletes
the sign-in and leaves every row in Neon behind — exactly what this form says
does not happen. Ours deletes both.

### Ads

**No.** The Capacitor app refuses every request to Google's ad hosts in
`MainActivity.java` (`NoAdsWebViewClient`), and `AdSlot` renders nothing in
either app.

**For the TWA listing only:** the TWA is Chrome, so the native block does not
apply there. `AdSlot` still renders nothing, but `adsbygoogle.js` loads on
every page, and **if Auto ads is switched on in the AdSense console it will
place ads inside the TWA.** Keep Auto ads off, or answer Yes on the TWA's
listing.

### Content rating (IARC questionnaire)

| Question | Answer | Why |
|---|---|---|
| Category | Game | |
| Violence | No | Falls and lava respawn the player; no combat, no blood. The arena duel was removed in September 2026 |
| Sexuality, language, drugs | No | |
| Gambling / simulated gambling | No | The "lucky run" is a random bonus of *earned* coins; coins cannot be bought and are not real money |
| Users can interact | **Yes** | Leaderboards show players' names, and ghosts race you against other players' runs. Live races return with `RACE`. No text or voice chat |
| Shares user-generated content | **Yes** | Published worlds are browsable and playable by anyone |
| Shares location | No | |
| Digital purchases | No | The shop spends in-game coins only |

### Target audience

13 and over. `/privacy` states the site is not directed at children under 13.

---

## Data safety

**Encrypted in transit:** Yes (HTTPS only; `cleartext: false`).
**Users can request deletion:** Yes — the URL above.
**Data sold:** No.

A service provider processing on our behalf (Clerk, Neon, Vercel, the room
server) is not "sharing" in Play's definitions. Nothing is shared with a third
party for its own use.

| Data type (Play's name) | Collected | Optional | Purpose | Source in code |
|---|---|---|---|---|
| Personal info → Email address | Yes | Yes (account only) | Account management | Clerk |
| Personal info → Name | Yes | Yes | App functionality (leaderboard name) | `runs.name`, from the Clerk first name/username |
| Personal info → User IDs | Yes | Yes | App functionality, Account management | Clerk user id on `players`, `runs`, `worlds` |
| App activity → Other user-generated content | Yes | Yes | App functionality | `worlds.doc` |
| App activity → Other actions | Yes | Yes | App functionality | Course times, medals, ghosts, coins, owned characters |
| App info and performance → Other app performance data | Yes | No | Analytics | Vercel Speed Insights: page address, device type, load timings; no cookies, not linked to an account |
| Device or other IDs | Yes | No | App functionality | `game_likes.anon_id`: a random id kept in the browser to stop double likes; never joined to an account |

Not collected: location, contacts, photos, files, audio, calendar, messages,
health, financial info, installed apps, web browsing history, search history.

A hash of the caller's IP, the route and the hour is kept for up to three
hours (its hour plus the sweep delay) to rate-limit writes (`rate_hits`, `src/lib/db/rate-limit.ts`). The raw IP is
never written down. If a reviewer asks, that is ephemeral processing for
fraud prevention.
