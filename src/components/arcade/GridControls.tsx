"use client";

import type { GameTag } from "@/content/registry";
import { SORTS, SORT_LABELS, type Sort } from "@/lib/game-sort";

/**
 * Sort control and tag chips above a grid.
 *
 * ── Why the state is in the URL and not in this component ────────────────
 *
 * So a filtered view is a link. "The three puzzle cabinets" is a thing worth
 * sending somebody, and a filter held in React state is a thing that cannot be
 * sent, cannot be bookmarked, and is lost by the Back button after opening a
 * cabinet. The owner reads and writes it; this component only reports presses.
 *
 * ── `aria-pressed` rather than a checkbox ────────────────────────────────
 *
 * A chip is a toggle button and that is what it announces. Checkboxes would
 * need labels, a group name and a fieldset to say the same thing, and would
 * still not look like chips.
 */
export function GridControls({
  sort,
  tags,
  offered,
  total,
  showing,
  onSort,
  onToggleTag,
  onClear,
}: {
  sort: Sort;
  tags: readonly GameTag[];
  /** The chips worth offering for this grid. See `filterTagsFor`. */
  offered: readonly GameTag[];
  total: number;
  showing: number;
  onSort: (next: Sort) => void;
  onToggleTag: (tag: GameTag) => void;
  onClear: () => void;
}) {
  const filtered = tags.length > 0;

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="hud-label" id="grid-sort-label">
          Sort
        </span>
        {/* A row of toggles rather than a <select>. Three options is fewer
            than a menu is worth, and a native select on a phone opens a
            full-screen wheel to choose between three words. */}
        <div
          role="group"
          aria-labelledby="grid-sort-label"
          className="flex flex-wrap items-center gap-1.5"
        >
          {SORTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSort(s)}
              aria-pressed={sort === s}
              className={`hud-chip ${sort === s ? "is-active" : ""}`}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>

        {/* The count, right-aligned, and only once it says something a player
            did not already know. "8 of 8" is a readout of the obvious. */}
        {filtered && (
          <span className="hud-label num sm:ml-auto">
            {showing} of {total}
          </span>
        )}
      </div>

      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {offered.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                aria-pressed={on}
                className={`hud-chip ${on ? "is-active" : ""}`}
              >
                {tag}
              </button>
            );
          })}
          {filtered && (
            <button type="button" onClick={onClear} className="hud-chip">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What a grid says when every card has been filtered out.
 *
 * It always offers the way back. An empty state with no control on it is a
 * dead end, and the player arrived here by pressing two chips that are still
 * lit above — which is information, but not an action.
 */
export function EmptyGrid({ onClear }: { onClear: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6">
      <p className="text-dim text-sm">
        Nothing matches all of those at once.
      </p>
      <button type="button" onClick={onClear} className="hud-chip hud-chip--primary">
        Clear filters
      </button>
    </div>
  );
}
