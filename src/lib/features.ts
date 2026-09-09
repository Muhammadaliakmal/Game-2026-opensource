/**
 * What v1 ships with, as one switch each.
 *
 * ── Why flags and not deletions ──────────────────────────────────────────
 *
 * The completion spec's scope cut is right about the problem — five products
 * in one repo is a studio's roadmap, not a solo dev's — and its instinct to
 * delete is right about most codebases. It is wrong about this one, for a
 * reason worth writing down: the builder is not a stub. It has a command bus,
 * an undo stack, op replication to a room, a validated document format and a
 * server-derived course floor, and all of it is under test. Deleting thirty
 * working files to make a menu shorter trades a week of writing for a week of
 * un-writing.
 *
 * What the cut is actually for is the PLAYER's experience: a game whose front
 * page offers "Remix" and "New world" alongside "Play" is a game that has not
 * decided what it is. That is a presentation problem, and a presentation
 * problem is solved by not presenting it.
 *
 * So the entry points go and the code stays. Flipping `UGC` back is one line
 * and no merge; deleting it would have been one line and a month.
 *
 * ── Why not an environment variable ──────────────────────────────────────
 *
 * A `NEXT_PUBLIC_` var is read at build time and therefore has to be set
 * correctly on every deploy target, which makes "is the builder on" a question
 * about the host rather than about the code. It is a product decision, it is
 * the same on every deploy, and it belongs in the repo where it can be
 * reviewed in a diff.
 */

/**
 * The world builder, Remix, and "New world".
 *
 * OFF for v1. The routes still exist and still work — `/build/:id` is
 * reachable by URL and by anyone who has bookmarked it, and every API route
 * behind it is untouched — so nothing anybody has made becomes unreachable.
 * What is hidden is every affordance that INVITES someone in: the buttons on
 * the home page, the remix action in a world's menu, and the create tile.
 *
 * The built-in worlds are unaffected. They are parkour environments and
 * sandboxes, and they were never the UGC feature.
 */
export const UGC = false;
