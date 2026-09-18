"use client";

import { useState } from "react";
import { DiscordIcon } from "@/components/DiscordLink";
import {
  DISCORD_DISMISSED_KEY,
  DISCORD_PATH,
  mayPromptDiscord,
  runEarnedPrompt,
} from "@/lib/discord";

/**
 * One line under the time, after a run worth being pleased about.
 *
 * ── Why this moment and no other ─────────────────────────────────────────
 *
 * It is the only moment on the site where a player has just done something
 * and is sitting still looking at proof of it. Anywhere else — a load screen,
 * a menu, a corner popup — asking them to go somewhere is asking them to stop
 * doing the thing they came for. The spec's instruction is unambiguous about
 * the alternatives: "Do not add a modal, a corner popup, or an interstitial.
 * The site's whole appeal is that it starts instantly."
 *
 * ── The three conditions, all of them necessary ──────────────────────────
 *
 * A personal best or a medal (`runEarnedPrompt`), a week since the last
 * dismissal (`mayPromptDiscord`), and a finish. A plain completion is not an
 * achievement, and a failed run is the worst possible moment — somebody who
 * just fell off a course is not in the market for a community.
 *
 * Both rules live in `lib/discord.ts` as pure functions, which is what lets
 * "at most once per week" be asserted rather than assumed.
 *
 * ── Read once, in a lazy initialiser ─────────────────────────────────────
 *
 * CLAUDE.md's rule is that a value living outside React is read with
 * `useSyncExternalStore` rather than an effect that calls `setState`. This is
 * neither: it is a one-shot decision taken when the panel opens, and the
 * answer must not change underneath the player while they are reading it. A
 * subscription would re-evaluate mid-panel; an effect would paint the line and
 * then remove it. A lazy initialiser reads storage once, before the first
 * paint, and the panel is client-only so there is no server render to
 * disagree with.
 */
export function DiscordNudge({
  finished,
  personalBest,
  medal,
}: {
  finished: boolean;
  personalBest: boolean;
  medal: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [allowed] = useState(() => {
    try {
      return mayPromptDiscord(Date.now(), localStorage.getItem(DISCORD_DISMISSED_KEY));
    } catch {
      // No storage means no memory of a dismissal, which would make this line
      // appear after every good run. Silence is the safe direction.
      return false;
    }
  });

  if (dismissed || !allowed) return null;
  if (!runEarnedPrompt({ finished, personalBest, medal })) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISCORD_DISMISSED_KEY, String(Date.now()));
    } catch {
      /* Hidden for this panel either way — see the initialiser above. */
    }
    setDismissed(true);
  };

  return (
    <div className="flex w-full items-center justify-center gap-2">
      <a
        href={DISCORD_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="hud-label text-accent inline-flex items-center gap-1.5 hover:brightness-125"
        // Following the link is consent to be asked no more; the counter
        // starts here too, so somebody who joined is not asked again next
        // week as though they had ignored it.
        onClick={dismiss}
      >
        <DiscordIcon className="h-3.5 w-3.5" />
        Nice run. Compare it with the others →
      </a>
      <button
        type="button"
        onClick={dismiss}
        // A named control rather than a bare ×: this is the only dismissible
        // thing in the HUD, and a 10px glyph beside a link is a target nobody
        // hits with a thumb.
        aria-label="Dismiss, and do not ask again this week"
        className="hud-chip hud-chip--icon"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 4l8 8" />
          <path d="M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
