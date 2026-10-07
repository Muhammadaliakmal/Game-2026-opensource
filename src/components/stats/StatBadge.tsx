"use client";

import { useEffect, useState } from "react";
import { getAnonId } from "@/lib/anon-id";
import { hasLiked, setLikedLocally, useLiked } from "@/lib/liked";
import {
  formatLikes,
  formatPlays,
  likesLabel,
  playsLabel,
} from "@/lib/stat-format";
import { useStats } from "./StatsProvider";

/**
 * How many played it, how many liked it, and the one control on a card.
 *
 * ── Where it sits in the markup ──────────────────────────────────────────
 *
 * On a `.card-linked` container, above the stretched link, in a
 * `.card-actions` layer. That is not decoration: a `<button>` nested inside an
 * `<a>` is invalid HTML, and the whole-card link is the pattern every card
 * here uses. See the note in `globals.css`.
 *
 * ── Under fifty plays it shows a dash ────────────────────────────────────
 *
 * The rule, and its reasoning, are in `lib/stat-format.ts`. Short version: "3
 * plays" is an argument against pressing the card, made by the card, at the
 * moment a new game most needs someone to try it.
 *
 * ── The heart moves before the network does ──────────────────────────────
 *
 * A like is a press with no consequence to get wrong, so waiting for a round
 * trip to acknowledge it makes the control feel broken on any connection
 * worse than an office one. It moves immediately, the request follows, and a
 * non-2xx puts it back. The count it springs back to is the server's, not the
 * one it guessed.
 *
 * ── The anonymous id is created on the first like, never on a page view ──
 *
 * `getAnonId()` generates and stores one if there is none, so calling it
 * during render would mint an identifier for every visitor who ever saw a
 * card. Calling it in the click handler mints one only for somebody who chose
 * to press a heart — which is the only thing it is for. See `lib/anon-id.ts`.
 */

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* A play triangle in a rounded square: the shape that means "played"
          without also meaning "watched", which is what an eye would say. */}
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2.4" />
      <path d="M6.6 6.2 10.2 8l-3.6 1.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 13.2 2.9 8.3a3.1 3.1 0 0 1 4.4-4.4L8 4.6l.7-.7a3.1 3.1 0 0 1 4.4 4.4z" />
    </svg>
  );
}

export function StatBadge({
  slug,
  className = "",
}: {
  slug: string;
  /** Extra positioning from the card. The badge owns its own colours. */
  className?: string;
}) {
  const ctx = useStats();
  const liked = useLiked();

  /*
   * Registration, and why it is an effect rather than a render-time call.
   *
   * `register` writes to a ref and queues a microtask, which is a side effect
   * — doing it during render would run it twice under StrictMode and once per
   * re-render after that. The effect runs once per slug, which is once per
   * card.
   */
  useEffect(() => {
    ctx?.register(slug);
  }, [ctx, slug]);

  /**
   * The optimistic view, held only while a request is in flight.
   *
   * `null` means "believe the store". Anything else outranks it, which is what
   * makes the press instant and the revert exact.
   */
  const [pending, setPending] = useState<{ liked: boolean; likes: number } | null>(
    null
  );

  const stat = ctx?.stats[slug];
  const isLiked = pending?.liked ?? liked.has(slug);
  const likeCount = pending?.likes ?? stat?.likes ?? 0;

  async function toggle() {
    const next = !isLiked;
    const before = hasLiked(slug);
    const base = stat?.likes ?? 0;
    const optimistic = Math.max(0, base + (next ? 1 : -1));

    setPending({ liked: next, likes: optimistic });
    setLikedLocally(slug, next);

    /*
     * Minted here and nowhere earlier. A browser with no storage at all — a
     * locked-down private window — gets an empty string back, and the press
     * simply undoes itself: there is no id to deduplicate against, so a like
     * from here could be counted any number of times.
     */
    const anonId = getAnonId();
    if (!anonId) {
      setLikedLocally(slug, before);
      setPending(null);
      return;
    }

    try {
      const res = await fetch("/api/stats/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, liked: next, anonId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { likes?: number };
      if (typeof data.likes === "number") ctx?.setLikes(slug, data.likes);
    } catch {
      // Put it back exactly as it was, including in storage — the local
      // mirror moved first and has to move back with it.
      setLikedLocally(slug, before);
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className={`card-actions flex items-center gap-2.5 ${className}`}
      /*
       * The card is a stretched link, so a press that lands on the padding
       * between these two controls would follow it. That is the correct
       * behaviour and is left alone; only the button below takes its press
       * back, and it does so by being a button rather than by cancelling.
       */
    >
      <span
        className="hud-label num text-dim inline-flex items-center gap-1"
        title={playsLabel(stat?.plays)}
      >
        <PlayIcon />
        <span aria-hidden="true">{formatPlays(stat?.plays)}</span>
        <span className="sr-only">{playsLabel(stat?.plays)}</span>
      </span>

      <button
        type="button"
        onClick={(e) => {
          // Not for the link — a sibling, not an ancestor, so there is nothing
          // to bubble into. This is for a card that also has its own onClick,
          // which the arcade lobby's tiles do.
          e.stopPropagation();
          void toggle();
        }}
        aria-pressed={isLiked}
        aria-label={likesLabel(likeCount, isLiked)}
        className={`hud-chip--touch hud-label num inline-flex items-center gap-1 transition-colors ${
          isLiked ? "text-accent" : "text-dim hover:text-ink"
        }`}
      >
        <HeartIcon filled={isLiked} />
        <span aria-hidden="true">{formatLikes(likeCount)}</span>
      </button>
    </div>
  );
}
