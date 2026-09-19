# AdSense: "Low value content" on specdrivengames.com

Status as of **19 September 2026**. Supersedes the generic checklist this
started as — that one was written without seeing the site, and about half of
it did not apply.

---

## 0. What actually triggered it

Not the trust pages. Those were already right: About names a real person in a
real city, Contact has a working address, Privacy and Terms exist and are
linked from every content page, and `ads.txt` carries the correct publisher
ID. A previous pass had done all of that, and the rejection came anyway.

The problem was that **the site had almost nothing on it a crawler could
read**, and what little there was, was repeated.

Two specific faults:

**1. Twenty-seven URLs in the sitemap contained zero words.**
`/play/<slug>` mounted a WebGL canvas and nothing else — no `generateMetadata`,
no `<h1>`, no prose. Googlebot does not run WebGL, so it fetched twenty-seven
near-identical empty documents and was explicitly invited to judge the domain
on them by their presence in `sitemap.xml`. That is the literal definition of
auto-generated pages with no unique content.

**2. The readable corpus was about 2,000 words, site-wide.**
Home was ~90 words of prose. `/games` was ~20. `/arcade` ~140. The blog had
three posts, all with `status: "planned"` and no bodies. A domain that is
mostly navigation with little substance is the other half of the same policy.

**The corrected count: ~26,000 words across 54 static pages.**

---

## 1. The structural fix: split the app surface from the readable surface

This is the change everything else hangs off, and it is the one to understand
before touching anything here again.

A game canvas and an article about a game are different documents and were
living at one URL. They are now two:

| | Before | After |
|---|---|---|
| `/play/<slug>` | In the sitemap. No title, no text. | `noindex, follow`. Real `<title>` and OG card so shared links still unfurl. Canonical points at the guide. |
| `/games/<slug>` | Did not exist. | The written guide. In the sitemap. 36 of them. |

`robots.txt` still **allows** `/play/`. That is deliberate and easy to get
backwards: a URL disallowed in robots.txt is a URL Google never fetches, so it
never sees the `noindex` and the page can stay indexed indefinitely. Disallow
hides; `noindex` removes. We want removal.

The twenty-seven wordless URLs left the sitemap and were replaced one-for-one
by thirty-six guides (23 courses + 4 sandbox worlds + 9 cabinets).

---

## 2. Why the guides are not a template with the name swapped

This is the half that a "just add more pages" fix gets wrong, and it would
have earned the same rejection faster.

**Every number on a guide page is measured from the geometry the game
actually builds.** `scripts/course-stats.ts` solves each course — a Dijkstra
over every standable surface — and writes `src/content/course-facts.ts`:
block count, footprint, height, checkpoints, hazard count, and the shape of
the solved route (jumps, widest gap, total climb, biggest drop, net rise).

That produces facts that cannot be written about each other:

- **Spindle** — 24 jumps in an 18x16 footprint, climbing 24. A vertical needle.
- **Overclock** — 30 jumps down a 119x9 corridor, netting +3. A flat sprint.
- **Arc Light** — an 11-cell drop and a 5.3-cell gap, both ladder records.
- **Magma Gauntlet** — 12,240 parts, of which **11,651 are hazard blocks**.

`src/content/course-notes.ts` is the prose layer, written against those
numbers. `src/components/guide/Standouts.tsx` then ranks each course against
the whole ladder and prints only the places it holds **outright** — ties are
never claimed, and 7 of 23 courses show nothing there, which is the correct
output for a course that is unremarkable.

**Measured result:** mean pairwise vocabulary overlap between guide pages went
from 0.63 to **0.38** after this work. Anything that pushes it back up is a
regression.

### The rule for anyone writing here later

> If a specific did not come from the code or from a measurement, cut it.

No player counts, no average completion times, no "most players find". There
is no honest way to produce those yet, and a number nobody can check is worth
less than a sentence they can.

---

## 3. Keeping it honest: the drift tests

Generated facts are a cache, and a cache with no invalidator publishes
confident wrong numbers. Three tests exist for that:

- **`src/content/course-facts.test.ts`** — rebuilds every world and asserts the
  part counts, hazard counts, checkpoints and bounding box still match the
  table. Edit a course without running `npm run courses:stats` and the suite
  fails with the new value named. It also asserts every guidable thing has
  notes, that they are long enough to be worth a page, and that only courses
  (things with a goal) carry an "approach".
- **`src/content/controls.test.ts`** — `content/controls.ts` is a server-safe
  copy of the default keybindings, because `lib/keybinds.ts` is `"use client"`
  and would drag a zustand store onto a static page. This test holds the copy
  to `DEFAULT_BINDS` and `FOOT_LABELS`.
- **`src/lib/site-links.test.ts`** (existing) — every footer link resolves to a
  route that exists.

**One real bug this caught.** The first draft of the course notes said "hold
sprint". `Player.tsx` shows sprint is a *latch*: tapping Shift toggles sprint
and a camera lock-on together. "Hold Shift" is advice that does nothing. That
is exactly the failure mode the policy is aimed at — plausible text written
*about* a game rather than *from* it.

---

## 4. What was added

**New content pages**

| Route | What it is | Words |
|---|---|---|
| `/games/<slug>` ×36 | Per-game guide: what it is, the route, how to approach it, measured facts, ladder rankings, medal times, controls | ~560 each |
| `/how-courses-are-made` | Editorial standards: the jump arc, the 80% design margin, reachability proofs, how medal times are derived | 1,184 |
| `/controls` | Full keyboard + touch reference, on foot, on the bike, and all nine cabinets | 1,144 |
| `/blog/night-sky-that-went-black` | The sky change that dropped light to a seventh and rendered every chrome rail black | ~850 |
| `/blog/designing-the-courses` | Why jumps are computed, what the design margin protects, why medals are measurements | ~900 |
| `/blog/why-browser-games` | What the web buys and costs; occlusion culling, the frame cap, monetisation | ~1,000 |

**Expanded**

- **Home** — `<SiteIntro>` below the games: what the site is, how the ladder
  works, and five real FAQ entries with `FAQPage` structured data. The prose
  sits *under* the hero and the games hub deliberately; solving a crawler's
  problem by putting three sections of text in front of the play button would
  have been fixing one problem by creating another.
- **`/games`** — 20 words → 1,051. Now a full text index of every course by
  tier, every cabinet and every sandbox world, each linking to its guide.
- **`/arcade`** — 143 → 819. How the arcade works, all nine cabinets as text,
  and why the payout rates differ (a cabinet with a ceiling pays more per
  point than one you can play forever).
- **`/race`** — 213 → 527. The shared track footprint, server-side lap
  counting, drift-fills-boost, and why the mode can fail to connect.
- **`/parkour`**, **`CourseCard`**, **`ArcadeLobby`** — every card now carries
  a guide link. Without these the guides would be orphans reachable only from
  the sitemap.

**Structured data** — `VideoGame` on every guide, `BreadcrumbList` on every
page with a trail, `BlogPosting` on posts, `Article` on the methodology page,
`TechArticle` on controls, `FAQPage` + `WebSite` on home.

---

## 5. `/shop` is noindexed, and that was the right call

`<Shop>` is a client component whose entire content — wallet, character grid —
arrives after a fetch. A crawler gets ~142 words of chrome. It is now
`noindex, follow` and out of the sitemap.

There was nothing to fix by writing more on it. It is an account screen, not
an article, and the honest move for a page like that is to stop asking to be
judged on it. `/contact` stays indexed at ~149 words because a contact page is
*supposed* to be short — brevity there is correct, not thin.

---

## 6. Ad placement — unchanged, and already correct

`src/lib/ads.ts` was already right and the rule is worth restating:

- **No ads on any screen with a session running** — `/play`, `/race`,
  `/parkour`'s course itself, `/build`. Two reasons, and the second decides
  it: an ad beside a 60 fps canvas competes for the main thread, and an ad
  next to a control being tapped at speed is an accidental click, which is the
  kind of traffic that gets an account closed rather than paid.
- **No ads on `/shop`** — a real-money ad next to a coin price is a confusing
  purchase flow whoever served it.
- A new `guide` placement was added for the guide, blog, arcade and methodology
  pages. These are the only pages on the site that are prose first and canvas
  second, which makes them the one unambiguously safe placement.

Every slot id in `AD_SLOTS` is still `""`, so `<AdSlot>` renders nothing.
That is fine for Auto ads. **See §8 for what you need to do about it.**

---

## 7. Verification (all re-runnable)

```
npm test                 # 658 pass, 4 skipped (known RIGGED skips), 0 fail
npx tsc --noEmit         # clean
npx eslint src           # clean
npm run build            # 70 static pages
npm run courses:stats    # regenerate course-facts.ts after editing a course
```

Measured from the built output in `.next/server/app`:

- 54 static HTML pages, ~25,700 words of prose
- 53 URLs in `sitemap.xml`, **zero** of them `/play/`
- 36 guide pages, mean pairwise vocabulary overlap 0.38

---

## 8. What is left, and it is not code

These are the only remaining items, and none of them can be done from the
repository.

- [ ] **Deploy.** Every change above is local. Google cannot review a build
      that has not shipped.
- [ ] **Submit the new sitemap** in Google Search Console and request indexing
      for `/games`, `/how-courses-are-made`, `/controls` and the three posts.
- [ ] **Wait for the recrawl before reapplying.** The twenty-seven `/play/`
      URLs have to *drop out* of the index, which needs Google to fetch each
      one and see the `noindex`. That takes days to a couple of weeks.
      Reapplying the same day is how you get the same answer.
- [ ] **Create the ad units.** AdSense → Ads → By ad unit → Display ad, then
      paste each numeric id into `AD_SLOTS` in `src/lib/ads.ts`. Until then
      only Auto ads serve. This is a paste, not a code change.
- [ ] **Read the three blog posts before you leave them up.** They are written
      in first person, under your name, from material in this repository — the
      light-check story, the occlusion figures, the frame cap, the jump arc.
      Every fact in them is checkable against the code. But they are your
      voice on your site, so read them and change anything that does not sound
      like you. The load-time claim in post 3 is deliberately left qualitative
      because there is no measured figure for it; if you measure one, put it
      in.
- [ ] **Consider a mailbox on the domain.** `CONTACT_EMAIL` is a gmail
      address, which is honest and works. A `hello@specdrivengames.com` that
      actually receives mail is a small credibility gain. See the note in
      `lib/site.ts` — the reason it is gmail is that an address which bounces
      is worse than one that looks unofficial.

## 9. What not to do

- **Do not add pages to raise a page count.** Thirty-six guides work because
  each one is about a thing that exists and quotes measurements of it. Thirty-six
  pages generated from a paragraph template would be the same rejection, faster.
- **Do not put `/play/<slug>` back in the sitemap.** It is a canvas. It has
  nothing to say to a crawler and never will.
- **Do not disallow `/play/` in robots.txt** thinking it reinforces the
  `noindex`. It does the opposite — see §1.
- **Do not add ads to a game screen** to increase inventory. See §6.
