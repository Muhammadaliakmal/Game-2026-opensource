"use client";

import { useSyncExternalStore } from "react";
import { NEW_FOR_DAYS } from "@/content/registry";

/**
 * "New", for a fortnight after something ships.
 *
 * ── Why the clock is not read in the page ────────────────────────────────
 *
 * The obvious version is `isNew(entry, Date.now())` in the server component
 * that renders the card, and the lint rule rejects it: `react-hooks/purity`
 * treats `Date.now()` in a component body as what it is, a value that differs
 * between two renders of the same inputs. The rule is right beyond the
 * technicality — `/parkour` is `force-dynamic` today and would silently start
 * baking a stale date into the pill the day somebody cached it.
 *
 * `DailyChallenge` has the same problem and solves it the same way: read the
 * clock in the store snapshot, never in render. CLAUDE.md states the rule.
 *
 * ── The subscription that never fires ────────────────────────────────────
 *
 * Deliberately a no-op. The value changes once, fourteen days after the date
 * on the row, and nobody has a page open for a fortnight. `getSnapshot`
 * returns a boolean, which `useSyncExternalStore` compares by value, so
 * reading the clock on every render is free of the identity trap that a
 * returned object would have.
 *
 * On the server it is always false, so the pill appears on hydration. It is
 * absolutely positioned over the cover, so nothing moves when it does.
 *
 * ── This is only half the test ───────────────────────────────────────────
 *
 * The other half — whether this entry is in the latest batch of content at all
 * — is `inNewestCohort` in `content/registry.ts`, and the caller has already
 * applied it by deciding whether to render this component. Both are needed:
 * on a catalogue built in eighteen days, the date window alone put a pill on
 * eighteen of twenty-three cards.
 */

const noop = () => () => {};

export function NewPill({ addedAt }: { addedAt: string }) {
  const fresh = useSyncExternalStore(
    noop,
    () => {
      const added = Date.parse(addedAt);
      if (Number.isNaN(added)) return false;
      return Date.now() - added < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
    },
    () => false
  );

  if (!fresh) return null;

  return (
    <span className="hud-label bg-accent/20 text-accent absolute top-2 left-3 px-1.5 py-0.5">
      New
    </span>
  );
}
