# Phase 7 — "Your own course": authored courses, a general medal ladder, and shipping

Phase 6 closed with twenty parkour courses, medals derived from a solver,
leaderboards and ghosts — and every one of those courses generated from
TypeScript. This phase is about the gap that leaves: the game has a builder and
it has a parkour mode, and nothing connects them.

Written the same way as `plan-phase5.md` and `plan-phase6.md`: what already
exists is stated first so it does not get rebuilt, the places the obvious plan
is wrong *for this codebase* are recorded so they do not cost a week, and the
one decision that blocks the first step is left open rather than assumed.

---

## 0. What already exists, and is most of this phase

A naive reading of "let players make courses" schedules a data model, a
runtime, a leaderboard and a replay system. All four are already here. They
were built world-agnostic and then only ever pointed at generated worlds.

| Piece | Status |
|---|---|
| `goal` and `checkpoints` on the world document | **Done.** `worlddoc.ts` has both, zod-validated, checkpoints capped at 64, each `{pos, yaw}`. Both optional, because most worlds are not courses. |
| The run clock, personal best, checkpoint pips | **Done and world-agnostic.** `play/course.ts` keys its best on `worldId` and does not care where the world came from. |
| Respawn to checkpoint, with facing | **Done.** `checkpoints.ts` is pure and takes a `Checkpoint[]`, not a slug. |
| Goal detection | **Done.** `GoalZone` reads `doc.goal`. |
| Ghost recording and playback | **Done.** `RunRecorder` / `GhostRunner` / `lib/ghost.ts` record against the course's own clock; nothing is course-specific. |
| A leaderboard for an arbitrary world | **Done, and already reachable.** `runs.worldId` is `text` with **no foreign key** so it holds slugs *and* uuids, and `raceable()` in the runs route already admits any uuid world that is published or the caller's own. |
| A solver that reads a route floor off geometry | **Done and general.** `routeFloorMs(doc: WorldDoc)` takes a document. It was written against the shipped courses but has no slug in its signature. |
| Turning a built-in into a world you own | **Done.** Remix clones the generated doc into a real row. |
| Room server, Dockerfile, Render blueprint | **Done**, not deployed. See 7d. |

So the honest size of "user-authored courses" is: **two editor tools, and one
number that currently lives in a code constant.**

## 1. What is genuinely missing

- **No way to place a goal or a checkpoint.** The editor's tools are place,
  erase, paint, pick, spawn and prop. The two fields that turn a world into a
  course are unreachable from the UI, which is why every course in the game is
  generated from code.
- **The medal ladder is keyed by slug.** `floorMs`, `medalFor` and `medalTimes`
  all look up `AUTHOR_MS`, a constant in `medals.ts`. Hand them a uuid and they
  return `null` — which costs a user course its medals, and costs its board the
  only guard it has. `POST /runs` skips the impossible-time check when the
  floor is null, so today a user course's board is the one place a `fetch` with
  a small number in it lands unchallenged.
- **No discovery for user courses.** `/parkour` lists `BUILT_IN_WORLDS` by
  tier. `/browse` lists published worlds and has no idea which of them can be
  finished.
- **Deploy.** Phase 5 shipped the room server and deferred deploying it. Two of
  its acceptance rows — frame-rate with four real peers, and a genuine Clerk
  session mapping to the owner rather than `ALLOW_ANONYMOUS_ROOMS=1` — are
  still recorded as "not measured".
- **The frame budget has never been measured on a real device.** 6f's numbers
  came off a software rasteriser at DPR 1; draw calls and triangles are
  device-independent and trustworthy, fps and worst-frame from that run are
  not, and `plan-phase6.md` says so.
- **`HUMAN = 1.3` has still not been playtested.** Carried forward from 6e
  unchanged. It is the single constant behind every medal time in the game.

## 2. Four places the obvious plan is wrong *for this codebase*

**A. Do not add XP, levels or daily goals.** Phase 6 §1 listed them as missing
and 6e delivered medals, boards and ghosts instead. That was the right call and
it should be made explicit rather than left as a gap someone closes later.
`SPEC.md` §9 quotes Townscaper's designer on exactly this — *"When you can win,
you play to win. When you keep score, you play to the score... I wanted the
visuals and the joy of creation to be the whole point"* — and cites it as the
reason the build mode has no score. So an XP bar is **redundant** in the modes
that already keep score, where a medal is a better unit than a number that only
goes up, and **actively against the design** in the mode that deliberately
keeps none. Unlocks have the same problem one step removed: a cosmetic you have
to earn turns the palette into a progression gate, and the palette is the
creative loop.

**B. The route floor cannot be computed on the run-submission path.**
`routeFloorMs` walks every surface in the world and runs a shortest-path search
over it. `POST /runs` is a request handler on the hot path of finishing a run,
and a world is capped at 50,000 parts — roughly nine times Island, the largest
thing measured so far. The floor has to be computed when the *document*
changes, not when a run arrives, and cached.

**C. That cache cannot live in the WorldDoc.** The obvious place to put the
number is next to the geometry it describes. It cannot go there: the doc is
client-authored and `PUT /api/worlds/:id` accepts it wholesale, so a floor
stored inside it is a floor the client writes — which is not a floor. It has to
be a server-derived column on the `worlds` row, computed from the doc the
server just validated.

Note the seam: **two paths write `doc`**, `PUT /api/worlds/:id` and the
multiplayer `POST /api/worlds/:id/sync`. A recompute wired into one and not the
other leaves collaboratively-built courses with a stale floor.

**D. Still no friends boards.** 6e deferred them for want of a social graph and
nothing in this phase builds one. Unchanged, and restated so it is not
re-litigated.

## 3. Sequence

7a → 7b → 7c is a chain. 7d is independent of all three and can be done first,
in parallel, or by someone else.

### 7a — Goal and checkpoint tools — **done**

Two new members of the editor's tool union, placed the way the spawn flag
already is — that tool is the working precedent for "click a cell, write a
field on the doc, undo it like anything else", and it goes through the command
bus, so checkpoint placement is replicated to a multiplayer room for free.

Also needed: deleting a checkpoint, the 64 cap surfaced before it is hit rather
than as a validation error on save, and some way to see the order — a course
whose gates are numbered wrong is not obviously broken until someone runs it.
Facing comes from the camera at placement time, the way `Trail.mark()` derives
it from the direction the run leaves the pad.

**What it found first.** The tools were the smaller half. `editor-store.ts`
never read `checkpoints` or `spawnYaw` in `loadDoc` and never wrote them in
`toDoc` — while `goal`, the field sitting between them, was passed through
verbatim under a comment saying that dropping it "would quietly un-finish every
remix of the course". The two fields beside it were dropped in exactly that way.

It was never only a save bug. `WorldCanvas` builds the Play snapshot with
`toSnapshot(s.toDoc(""))`, so **remixing any shipped course and pressing Play
stripped its gates and its facing**: the course started you looking the wrong
way and sent you back to the beginning on every fall, with nothing on screen
saying why. A tool writing a field the save path discards would have shipped a
feature that silently did nothing, so this went first.

**What landed.** `goal`, `cp-add` and `cp-remove` joined the op union, so a
marker edit is undoable, invertible, and broadcast to a room like any other
edit — checkpoint authoring works in a shared build session for free. The
checkpoint ops are index-based because order *is* the mechanic, and each
carries its own value as well, so a stale index from a peer removes the gate
the op names rather than whatever now sits at that position.

Two smaller calls worth recording. `X` is the finish, not `F`: `FrameWorld`
owns `F` on its own window listener, and binding it twice would have framed the
world *and* switched tool on every press, with neither handler knowing why. And
nothing in `CourseMarkers` animates, because the editor canvas is
`frameloop="demand"` — a breathing ring would either not breathe, or would have
to `invalidate()` every frame and quietly undo the reason the editor is on
demand at all. A builder sees the whole course at once and needs the numbers;
motion is for the runner who can only see the next gate.

**Accept:** met. Both tools place through the command bus, so undo reaches
them; markers carry their index and their resume facing in the world; the cap
is enforced by the tool rather than by a failed save; and a load/save round trip
preserves the course. 18 new tests across `ops.test.ts` and
`editor-store.test.ts`, including the regression above. 209 app tests and 59
server tests pass, `tsc` is clean on both sides, and `next build` succeeds.

Not covered by any of that, and stated plainly: **nobody has clicked these
tools in a browser yet.** Everything above is the data layer and the store,
which is what tests can reach; that the chip is where a thumb expects it and
the marker lands under the cursor is 7d's kind of question.

### 7b — A medal ladder that is not keyed by a slug — **done**

**Landed: the split.** `medals.ts` now divides along the seam that was already
there. `medalTimesFor`, `medalForAuthor` and `nextMedalFor` take an Author time
in milliseconds and know nothing about identity; `floorFromAuthor` is the
stated inverse of `authorFromFloor`; and `authorMsFor(id, floorMs)` is the one
place the two sources of an Author time meet — the `AUTHOR_MS` table for a
shipped slug, a stored column for a player's course. The slug-keyed
`medalTimes`, `medalFor` and `nextMedal` survive as thin wrappers, so this
change is behaviour-preserving: 209 tests pass unchanged and `tsc` is clean.

**Measured, before building the rest.** §2B asserted the solver was too
expensive for the request path. It is, and now with numbers — taken with
`routeFloorMs` over every built-in:

| world | parts | solve |
|---|---|---|
| any world with no goal | 217–10,762 | **0.0 ms** (the early return) |
| the twenty shipped courses | 217–795 | 29–87 ms |
| Island, given a goal | 5,763 | **279 ms** |

Roughly linear in parts, so **~2 s at the 50,000-part cap**. On `POST /runs`,
which fires every time anybody finishes, that is indefensible. On a save it is
tolerable — except that the multiplayer `sync` path writes every 5 seconds
while a room is being built in.

**So the floor gets a fingerprint, not just a cache.** `surfaces()` in
`course-graph.ts` reads *only* `x`, `y`, `z` of each part; shape, rotation,
colour and finish never reach it, and neither do props. A hash over exactly
those inputs plus `spawn` and `goal` is O(n) with a tiny constant, and a match
is therefore a **proof** that the floor is unchanged rather than a guess about
it. That single fact settles both open problems at once:

- **Cost.** Re-solve only when the fingerprint moves. A repaint, a finish
  change, a rotation, a prop drag and an idle autosave all cost a hash.
- **§4, the board question.** The recommended rule — wipe a board only when the
  change actually moves the floor — stops being a heuristic. Cosmetic edits
  provably cannot move it, so they provably cannot cost anyone their time.

**Landed: the rest.** `lib/course-floor.ts` holds `courseKey` and
`courseFloorFor(doc, previous)`; `worlds.floor_ms` and `worlds.floor_key` are
columns (migration `0002_cold_tusk`), written by all **three** paths —
`POST /api/worlds`, `PUT /api/worlds/:id` and `POST /api/worlds/:id/sync`.
`POST /runs` resolves the floor per world and gives a user course the same 422
a shipped one gives, and `PlayHud` reads an `authorMs` off the course store
that `WorldCanvas` sets where the world loads.

Four things worth recording.

**The remix path came out free, which is the fingerprint earning its keep.** A
remix clones the source document and changes its `id`, `ownerId` and `name` —
none of which the solver reads. The source row's fingerprint therefore still
matches the clone, so remixing a course costs a hash instead of a solve. The
same fact is the whole reason `sync` is affordable.

**The floor is derived twice on the server and never once on the client.** The
two document-writing paths each compute it rather than sharing a helper that
would have to reach a database from a pure module. It is three lines in each,
and §2C's seam is the kind that gets re-opened by whoever adds the fourth write
path — so it is named in the schema column's own doc comment as well as in both
routes.

**`floorFromAuthor` is not an exact inverse, and now says so.** `POST /runs`
gets its floor two ways — divided back out of `AUTHOR_MS` for a slug, read off
the row for a uuid — and those disagree by up to a millisecond, because one
rounds and the other floors. Measured across all twenty courses: the derived
floor is never *above* the solved one, so the shipped guard is at worst a
millisecond more generous, never a millisecond stricter. `medals.test.ts` now
asserts that direction rather than an equality it never had; a guard that
refused a run somebody actually did would be the bad failure here.

**A migration that adds a derived column needs a backfill, or the gap is
silent.** Existing rows got null, which reads as "not a course": no medals and
no submission guard until somebody happened to press Save. `npm run
floors:backfill` closes it, is safe to re-run, takes `--all` for a change to
the key format or to the solver, and deliberately wipes no boards — it is
discovering a floor that was always true of that geometry, not moving one.
Against the dev database it found two courses among eighteen worlds and solved
each in about 100 ms.

**Accept:** met. `medals.test.ts` gains the case the acceptance asked for — the
same geometry under a uuid produces `AUTHOR_MS.parkour` and the identical four
medal times — plus the shipped table winning over any floor a row carries, and
the millisecond claim above. `course-floor.test.ts` adds ten more, including
that a repaint, a rotation, a finish change, a prop drag, a rename, a sky
change and a reordering of the parts array all leave the fingerprint alone,
that moving one block does not, and that a matching fingerprint returns a
stored floor without ever calling the solver. 222 app tests and 59 server tests
pass, `tsc` and `eslint` are clean, and `next build` succeeds.

Not covered by any of that, and stated plainly for the same reason 7a states
it: **no user-built course has been played end to end in a browser.** The
solver, the columns, the guard and the ladder are all reachable by tests; that
the medal on the finish panel is the one the player expected is 7d's kind of
question.

### 7c — Finding them — **done**

A published world with a goal is a course, and nothing surfaces that. The
cheapest honest version is a section on `/browse` and a Community group on
`/parkour`, driven by whether the doc has a goal.

Worth deciding rather than assuming: whether "has a goal" is queried out of the
JSONB on every page load or denormalised alongside `floor_ms` in 7b. 7b already
opens the row for a write, so the second is nearly free — and a course is
exactly a world whose `floor_ms` is not null, which means 7b may have already
built the index this needs.

**Answered: it did.** `floor_ms is not null` *is* the predicate, and a stronger
one than "has a goal" — a world with a floor has a goal something can actually
reach, where a goal nothing can reach would have listed as a course and then
refused to be finished. `worlds_course_idx` is a partial index on
`(published, updated_at) where floor_ms is not null`, so the community list is
an index scan over courses rather than a filter over every world anybody has
ever saved. Nothing queries it yet; that is the rest of 7c.

**What landed.** `lib/db/courses.ts` holds the one query — published, floor not
null, newest first — and `components/modes/CommunityCourses.tsx` is the one
card, used by both pages. Two of them rather than markup in each page, because
the ladder above it on `/parkour` is the standing proof of what the other way
costs: the parkour courses sat in a flat list on `/browse` for a phase, and
nothing about them said they were a ladder.

Three calls worth recording.

**Newest first, not most played.** `worlds_course_idx` is partial on
`(published, updated_at)`, so this ordering is an index scan and any other is a
sort of everything it matched. That is the cheap reason. The real one is that
play count reads as zero on every course until somebody finds it, which is the
exact problem the list exists to solve — sorting by it would rank courses by
how well they were already doing at the thing the page is supposed to do for
them.

**`/browse` partitions rather than duplicates.** The general list now excludes
courses (`floor_ms is null`) instead of listing them a second time under a
weaker heading. A published sandbox is a place to walk around and a published
course is a clock to beat; those are different offers, and "can be finished" is
the more specific claim, so it takes the world.

**`/parkour` stopped being a function of the repo, and says so.** Its doc
comment claimed no fetch, no client component and no loading state; a live list
breaks that, so the comment changed with the code rather than after it. The
route is `force-dynamic` — a cached copy of a list whose whole job is to show
what somebody published five minutes ago is worse than not having it — and the
section sits in its own `<Suspense>` boundary, so the twenty shipped courses
are in the static shell and paint before the query resolves. A slow database
delays the new section and nothing else.

**Accept:** publish a course, find it without its URL, play it as a stranger,
land on its board, and race the author's ghost.

**Met, in part, and the part is worth naming.** Against the dev database with
one of its two courses temporarily published: both pages render the card, the
Gold target derived from the course's own floor, and the empty state when
there is nothing to list — and `/browse` links the course exactly once, which
is the partition above holding rather than being asserted. The row was set back
to unpublished; nothing in the database was left changed.

What that does not cover is the second half of the acceptance — **played as a
stranger, landing on its board, racing the author's ghost.** That needs two
accounts and a browser, which is 7d's kind of question, and it is the same gap
7a and 7b each closed with the same sentence. 229 app tests and 59 server tests
pass, `tsc` is clean on both sides, `eslint` is clean, and `next build`
succeeds with `/parkour` correctly reported as dynamic.

### 7d — Ship it, and measure it on a real device

Independent of the above. Deploy the app and the room server, with a real Clerk
instance and the shared `MULTIPLAYER_SECRET` the blueprint warns about, then
close the two Phase 5 rows that need real browsers: four peers at 60 fps, and a
Clerk session token actually mapping to a world owner. Then the tier-3 phone
pass — `?perf=1` now mounts on every canvas, which is what 6f added it for.

**Accept:** `plan-phase5.md` §5 has no "not measured" rows left, and 6f's
frame-budget table has a column taken on hardware.

**In progress.** The measuring instruments exist and the artefacts are
verified; the deploy itself is waiting on credentials nobody but the account
holder can enter.

Verified locally (2026-09-08), because these are the parts of a deploy that can
fail without anyone's password:

- **The room server image builds and boots.** `docker build -f server/Dockerfile
  .` from the repo root, then the container answers `GET /` with 200 — which is
  what makes `healthCheckPath: /` in `render.yaml` correct rather than hopeful,
  and disproves the failure mode the Dockerfile's own comment warns about
  (dependencies installed at `/app` so `src/lib`'s `@/*` imports can resolve
  `zod` by walking up; get it wrong and the image builds clean and dies on
  boot).
- **Four peers, measured.** `npm run peers:soak` — see §5 of `plan-phase5.md`
  for the numbers and for the send-interval/patch-rate finding it turned up.
  It takes a `--url`, so the same command re-run against
  `wss://blockworld-rooms.onrender.com` is the deployed half of that row.
- **`next build` is clean**, 285 app tests and 59 server tests pass, `/parkour`
  is still correctly dynamic.

Still blocked, and on exactly three things:

1. **`vercel login`** — the CLI is installed and logged out. Nobody but the
   account holder can complete it, and no deploy of the app happens without it.
2. **A Render Blueprint run**, which is a wizard: it prompts for `APP_URL`,
   `CLERK_SECRET_KEY` and `MULTIPLAYER_SECRET` because they are `sync: false`.
   The app then needs the *same* `MULTIPLAYER_SECRET` and
   `NEXT_PUBLIC_MULTIPLAYER_URL=wss://…` — a build-time var, so setting it
   means redeploying the app, not just saving it.
3. **A device.** The tier-3 phone pass and the four-browser frame-rate half of
   §5 are properties of renderers on hardware. `?perf=1` mounts on every canvas
   for exactly this.

`server/scripts/room-token.ts` (`cd server && npm run token`) closes the other
Phase 5 row without a browser: it mints a genuine Clerk session token through
the Backend API, which `verifyJoin` cannot tell from a browser's, and
`peers:soak --token` presents it on the join. Written, typechecked, **not
run** — it reads `CLERK_SECRET_KEY` and creates a real session on a real
account, so it is the account holder's to run.

### 7e — Retune `HUMAN`

Only possible after 7d, and only worth doing with real times in the `runs`
table. One constant retunes all five medal tiers; the work is deciding what
percentile of real finishers Gold should mean, not editing the number.

## 4. The open decision that blocks 7b

**What happens to a board when the author edits the course under it.**

Shipped courses cannot change without a deploy, so 6e never had to answer this.
A user course can change between two people's runs, and the moment it does, the
stored medals on `runs.medal` describe a course that no longer exists — and so
does the floor that let those times through.

Three coherent answers:

1. **Recompute the floor, leave the medals.** Cheapest. A board can show a Gold
   that the current geometry would not award, and two players' medals on one
   board can mean different things.
2. **Wipe the board on a geometry change.** Honest and brutal: every time is
   against the course as it is. It also means an author fixing a typo'd block
   destroys everyone's runs, which will make authors afraid to edit.
3. **Freeze the floor at first publish, and treat a geometry change as a new
   course.** Consistent, and the most work: it needs a notion of course version
   that the `runs` primary key `(world_id, user_id)` does not currently have.

**Recommendation: 2, narrowed** — wipe only when the change actually moves the
floor, which 7b computes anyway. Cosmetic edits, prop moves and repaints leave
the board alone; moving a platform resets it. That makes the rule statable in
one line to an author, which none of the other three are. It needs an explicit
call before 7b, because it decides whether `runs` needs a version column.

**Decided: 2, narrowed — and shipped in 7b.** `runs` gets no version column.
Both document-writing routes answer a `boardReset` flag and delete the world's
runs when `floorMoved(before, after)`, and the fingerprint is what makes the
narrowing real rather than a heuristic: a cosmetic edit *provably* cannot move
the floor, so it provably cannot cost anybody their time. Losing the goal counts
as a move — the course those times were set on no longer exists. What is still
missing is the *telling*: nothing warns an author before the save that resets a
board, and nothing on the client reads the `boardReset` flag the routes now
return.

A second, smaller decision, for 7a: **whether checkpoint order is placement
order only, or reorderable.** Placement order is nearly free and a mis-ordered
gate means delete-and-replace; a reorder UI is a list panel in a 3D editor, and
that is real work. `checkpoints.ts` is indifferent — it says order comes from
the array and a course author decides what "later" means.
