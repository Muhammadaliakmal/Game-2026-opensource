# Blog outlines — to write, not to publish

Three posts, outlined. **These are notes for you, not drafts to ship.** They
live in `docs/` and not in `src/content/` deliberately: nothing here is on the
site, and nothing here should be pasted onto it.

## Why you write these and not an AI

The most common AdSense rejection is "Low Value Content". Three generated posts
about a project the generator has never played is the thing that rejection is
aimed at — and invented specifics ("players average 8 minutes a course",
"$16/day") published under your own name are worse than useless, because they
are false and they are attributable.

Twenty minutes each, in your own words, beats two thousand polished words of
invented detail. Target **500–800 words**. If you have not launched, write "I
haven't launched yet, so I don't know" — that reads as credible; a made-up
number reads as spam.

## How to publish one

1. Write it as a component in `src/content/blog/<slug>.tsx`, default-exporting
   the body. Plain `<p>`, `<h2>`, `<a>` — the article's wrapper styles them.
2. Uncomment its line in `BODIES` in `src/lib/blog.ts`.
3. Set `status: "published"` on its row there, with a real `date` and a
   one-sentence `summary`.

The footer link, the sitemap entry, the About page's "Writing" section and the
`/blog` index all switch on together the moment the first post is published.
Until then `/blog` 404s on purpose. `site-pages.test.ts` fails if a post is
published without a body, which is the mistake that would otherwise put a link
to a 404 on your own index.

---

## Post 1 — How Blockworld is built

- What it is, in two sentences.
- The stack you actually used, and **why** over the alternatives you
  considered.
- One thing genuinely harder than expected — the real problem, and how you
  solved it.
- One thing you got wrong and had to redo.
- What is still unfinished.

**Material you already have, all of it true and checkable.** These are the
strongest specifics in the repo; pick one or two and tell it properly rather
than listing all of them:

- **The frame-by-frame bug audit.** You recorded your own game and went through
  it frame by frame, finding 24 bugs — including text at a 1.04:1 contrast
  ratio, which is invisible. Almost nobody writes this post, and it is the best
  material here.
- **The night sky that turned everything black.** `npm run light:check` exists
  because a sky colour change was reasoned about as "a little dimmer" while the
  actual light dropped to a seventh of what it was. Metal surfaces are lit by
  the environment probe and nothing else, so every chrome rail on Neon Circuit
  rendered pure black. The fix that came first — a strongly blue fill — lit
  things correctly and turned the whole world blue. The check now prints
  resolved hex values so a colour cast is a number rather than a feeling.
  (See CLAUDE.md, "The sky".)
- **The frame cap.** `frameloop="always"` makes a 120 Hz phone do twice the GPU
  work for frames the game never uses, get hot, and throttle to *below* 60. The
  fix is a hard cap, and `advance()` takes seconds rather than milliseconds —
  passing `performance.now()` hands the first frame a delta of a million
  seconds.
- **Blocks nobody ever sees.** Occlusion culling drops 45% of Island's parts
  (1.73M triangles to 0.95M), 8.7% of Vapor Ridge, and exactly nothing on Neon
  Circuit — because it is flat, and a flat world has no interior.

## Post 2 — Designing the courses

- How you decide a course is fair rather than cheap.
- What the difficulty tiers mean, and how you set the target times.
- What one specific course teaches — pick one and walk through it.
- Something you changed after playing it yourself.

**Material:**

- Jumps are built against `lib/jump-arc.ts`, never a number in a comment, and
  the arc is **asymmetric** — fall gravity is 3×, so the textbook `2v/g`
  airtime is wrong by about 40%.
- The unit is **empty cells between platforms**, not centre-to-centre: two pads
  three cells apart have two cells of air between them. Getting that wrong is
  how a jump becomes frame-perfect by accident.
- `DESIGN_MARGIN` is the 20% that separates a hard jump from a frame-perfect
  one. Expert courses spend it; the safety underneath it is not spent.
- Every course is proved reachable by a test that walks the surfaces as a
  graph — including, and this is the one worth explaining, that the goal is
  still reachable **from every checkpoint**. A resume point you cannot continue
  from is a soft lock rather than a mercy.

## Post 3 — Why browser games

- Why the web instead of Unity or an app store.
- The genuine tradeoffs: load size, performance ceiling, discovery.
- How you are approaching monetisation, and why.

**Material:**

- A link opens a game. No download, no store review, no install — and the same
  build runs on a phone and a laptop.
- What it costs: everything has to arrive before somebody gives up waiting.
  That constraint is why occlusion culling, the frame cap and the draw-call
  budget exist at all. Be honest about the load time you have today.
- Monetisation: ads on the content pages rather than over the canvas, and an
  in-game currency earned by playing that buys characters and converts to
  nothing. Worth saying plainly that arcade payouts are computed on the server,
  because a client-held balance is a balance the player can edit.

---

## Before you publish any of them

Read it back and mark every number. For each one, ask where it came from. If
the answer is not "I measured it" or "it is in the code", cut it.
