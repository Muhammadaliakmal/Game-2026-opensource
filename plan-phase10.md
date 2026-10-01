# Phase 10: a sky to stand in, a clean bill, and a way to earn

Written 1 October 2026, before any code. Every defect below was found by a
Playwright audit of the production build (`next build && next start`) in the
light theme, at 1440×900 and 390×844. Nothing here is a guess about what
might be wrong.

## 0. Ground truth before the work

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `npm test` | 727 pass, 0 fail, 6 skipped |
| `eslint` | 0 errors, **35 warnings**, all in Gradle build output and a vendored skill template |
| `next build` | succeeds |
| Console errors on 20 pages | none, except the local-only `/_vercel/speed-insights` 404 (fine on Vercel) |

So nothing is crashing. The defects are visual, they show up mostly in the
light theme that shipped on 23 Sept, and every one of them is something a
player sees.

## 1. Defects found

| # | Where | What a player sees | Fix |
| --- | --- | --- | --- |
| D1 | Home hero | The block island floats on a flat `#14171a` box in the light theme: a black slab between a white header and a pale page | A sky behind the island: sky-blue gradient, soft drifting clouds and voxel clouds in the scene, by day. A deep night gradient in the dark theme |
| D2 | Home hero | "Drag to turn" is grey text on a grey panel (the glass is 58% *light* base over a black canvas) | Fixed by D1 (glass over a light sky), and the prompt uses ink, not dim |
| D3 | Home hero, phone | The island is cropped at both edges: the camera sits at the desktop distance on a portrait screen | Fit the camera distance to the aspect ratio |
| D4 | Every blog post | Two `<footer>` elements | **False positive.** The second is the article's own `<footer>` inside `<article>`, which is valid HTML and not a second site footer. Left alone |
| D5 | Game tiles, phone | Names cut off: "Chunk Run…", "Snakes & L…" | Size the title to the tile (container query units) rather than truncate |
| D6 | Parkour cover, phone | The runner figure sits on top of the description ("take the me▮dal") | Keep the art clear of the copy on narrow tiles |
| D7 | Parkour course cards | Night-black covers on a light page; the ladder numeral is invisible on them | The cover backdrop reads `--art-sky-*` like every other cover |
| D8 | Lint | 35 warnings from generated files bury any real one | Ignore Gradle `build/` and `.agents/` |
| D9 | Arcade grid, light theme | Ragdoll Rumble's tile is the one black banner in a pale grid | Its art reads `--art-duel-*`, defined by day only |
| D10 | Hero, light theme | The cyan palette swatch vanishes into the blue sky | Swatches get a white rim |

## 2. Earning, honestly

### What the research says

- Most web games earn from ads. Portal revenue share is Poki 50% (100% on
  your own traffic), CrazyGames 60% of ads / 70% of purchases
  ([cinevva](https://app.cinevva.com/guides/web-game-monetization),
  [playgama](https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share/)).
- **Rewarded ads pay the most**: roughly $15–28 eCPM in the US, $8–15 in the
  EU and $1–3 in tier-3 markets, about 2× an interstitial. Banners pay far
  less (same source).
- **Volume is everything.** A well-performing casual game makes roughly
  $200–$2,000 a month on a portal. Most games make under $100 over their
  lifetime. One cited data point is about €1.20 per 1,000 plays.
- Google's own route for a site like this is **H5 Games Ads** (the Ad
  Placement API: `adBreak()` / `adConfig()`). It offers interstitials at
  natural breaks and opt-in rewarded ads, and is open to any AdSense
  publisher with H5 games who follows program policy
  ([Google](https://developers.google.com/ad-placement/apis),
  [AdSense](https://adsense.google.com/start/h5-games-ads/)).
- Policy: full-screen ads only at natural transitions, never during
  continuous play, never after every action. Rewarded ads are opt-in only
  ([publisher policy](https://support.google.com/publisherpolicies/answer/11975916)).
- Retention is what makes the volume. Daily rewards and visible streaks are
  the most reliable levers, and an early win lifts day-1 retention. The site
  already has a daily challenge, streaks and coins, so that part is built.

### What that means here

The site has AdSense *display* slots wired with empty ids and an account that
was refused once for thin content (fixed 19 Sept). Display ads beside prose
earn very little. The one lever that both pays the most and fits a game is
the **rewarded ad**, and the arcade already has the right moment for one: a
run has just ended and coins have just been counted up.

### E1. Rewarded "Double it" on the arcade results screen

- After a paying run, if Google offers a rewarded ad (`beforeReward` fires),
  the results panel shows **Watch an ad · double it (+N)**. If no ad is on
  offer, the button simply does not exist. It is never a placeholder.
- The bonus is granted by a new `POST /api/arcade/bonus`, out of the **same
  daily pool and the same hard cap** as every other arcade coin
  (`DAILY_HARD_CAP`, 1,000 a day). A forged call buys nothing a forged score
  could not already buy, so the security position in `arcade-payout.ts`
  stays true as written.
- One bonus per run, at most 200 coins per call.

### E2. Interstitial at a natural break

- `adBreak({ type: "next" })` when the player presses **Again**, and only
  when that is also a natural pause: never the first runs of a session,
  never within 3 minutes of the last one. Google applies its own frequency
  cap on top of that.
- The game is muted and paused for the ad (`beforeAd` / `afterAd`).

### E3. Where game ads never appear

- In the Android app (Play policy; the app already shows no ads).
- Anywhere a session is running: the 3D worlds, the race, the builder.
- With `NODE_ENV !== "production"`, `data-adbreak-test="on"` is set so Google
  serves test ads in development.

### Owner steps nobody can do from the repo

1. AdSense → **Ads → H5 Games Ads**: turn it on for the site. Until then,
   `adBreak` shows nothing and the rewarded button never appears. That is
   the designed failure, not a bug.
2. Reapply for AdSense review once Search Console shows the `/play/` URLs out
   of the index (see `docs/ADSENSE.md`), and paste display unit ids into
   `AD_SLOTS`.
3. Distribution is the bigger lever than any ad format. Submitting the arcade
   cabinets to CrazyGames/Poki would need their SDKs and a standalone build
   per cabinet. That is a separate phase and is not attempted here.

**Expectation, stated plainly:** this makes the site *able* to earn. It does
not make it earn. At today's traffic the honest number is small. Revenue
scales with plays, and plays come from distribution and retention.

## 3. Unique

The sky is the place to be distinctive, because the island is the first
thing anyone sees. Instead of a stock gradient, the clouds are made of the
same thing as the world: **voxel clouds**, white blocks in the scene that
drift past the island and turn with it when it is dragged. Behind them is a
painted sky with soft clouds drifting slowly. By night the same island stands
under a deep navy sky.

## 3b. Notes from building it

- The first voxel-cloud placement put clouds at the camera's own radius and
  height, and one swung past the lens as a white slab across half the
  screen. They now sit beyond the orbit's reach (41+ units out) and below
  the island, where the downward-looking camera can actually see them, so
  the island reads as floating above a sea of clouds.
- `getPageTheme()` (lib/theme.ts) is the canvas-side twin of the light-token
  selector, and `ClerkThemeSync` now uses it instead of its own copy.

## 4. Trailer

After this ships: record each mode being played (parkour, race, arcade
cabinets, the hero), cut it into one trailer, and make a thumbnail.
Recording uses Playwright's video capture against the production build;
editing uses ffmpeg. Both are free and local.

## 5. Done when

- [x] D1–D10 fixed (D4 a false positive) and re-audited in light *and* dark,
      at desktop and phone
- [x] E1–E3 in place, with tests for the pacing and bonus arithmetic
      (`game-ads-policy.test.ts`)
- [x] `tsc`, `eslint` (0 warnings), `npm test` (730 pass), `next build` all clean
- [x] Pushed to `main` (`69ee5f7`)
- [x] Trailer and thumbnail delivered: 51.5 s, 1280×720, recorded from the
      production build on a real GPU (Playwright), cut with ffmpeg. Covers the
      hero by day and night, Neon Run, Magma Gauntlet, SwarmRush, Gravity
      Shift, One Bullet, Ludo, Chunk Runner, Ragdoll Rumble and the
      characters. The music bed is synthesised in the build script, so there
      are no licensing questions.
- **Not in the trailer: the race.** `RACE = false` in `lib/features.ts`
  because no room server is deployed, so a player cannot open it. Showing
  it would advertise a mode the site does not offer. Deploy the room server
  (CLAUDE.md, "Deploying the room server"), flip the flag, and it can join
  the next cut.

### What could not be verified here

- A real rewarded or interstitial ad. That needs H5 Games Ads switched on
  for the AdSense account, and a real browser on the live domain. The flows
  fail closed: with no ad there is no button, and "Again" never waits more
  than 1.5 s.
- How the voxel clouds look on a real GPU. They were judged under
  SwiftShader, which renders the same picture more slowly.
