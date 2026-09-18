/**
 * Where the Discord is, and how often we are allowed to mention it.
 *
 * ── One invite, resolved in one place ────────────────────────────────────
 *
 * The spec asks for `NEXT_PUBLIC_DISCORD_INVITE`, and there is a constant
 * under it so the site works with nothing configured. That is the same call
 * `lib/site.ts` makes about `SITE_URL`: a value that is the same on every
 * deploy that matters belongs where a diff can show it changing, and an unset
 * variable must not produce a header link that goes nowhere.
 *
 * Be honest about what the variable buys, though. `NEXT_PUBLIC_*` is inlined
 * at build time, so changing it still needs a redeploy — it is not the
 * "repoint without redeploying every surface" mechanism the spec is after.
 * The `/discord` route is: one URL to put in a video description, on a
 * screenshot or in a message, pointing at one line of this file.
 */

/** The invite in the spec. Used unless the environment names another. */
const DEFAULT_INVITE = "https://discord.gg/QJz4Rcvax";

/**
 * Only a real Discord invite is accepted from the environment.
 *
 * A typo in a deployment variable would otherwise become the destination of
 * the header link, the footer block and the `/discord` redirect at once, and
 * the failure is invisible from inside the app — nobody clicks their own
 * Discord link. Falling back to the constant means a bad value costs the
 * override, not the feature.
 */
export function isDiscordInvite(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (
      parsed.hostname === "discord.gg" ||
      parsed.hostname === "discord.com" ||
      parsed.hostname === "www.discord.gg"
    );
  } catch {
    return false;
  }
}

/**
 * Read as a direct member access, not through a destructured `env`, because
 * that is what Next statically replaces at build time.
 */
const CONFIGURED = process.env.NEXT_PUBLIC_DISCORD_INVITE?.trim();

export const DISCORD_INVITE: string = isDiscordInvite(CONFIGURED)
  ? CONFIGURED
  : DEFAULT_INVITE;

/**
 * The internal address every surface links to.
 *
 * Surfaces point here rather than at the invite so that a new invite is one
 * edit rather than four, and so the one link that is going to end up in a
 * YouTube description outlives the invite behind it.
 */
export const DISCORD_PATH = "/discord";

/* ── The one prompt, and how often it may appear ───────────────────────── */

/**
 * A week between mentions.
 *
 * The prompt is the only thing on this site that asks a player for something
 * rather than giving them something, and it appears at the single moment they
 * are most pleased with it — a personal best or a new medal. That moment is
 * worth one line and is not worth two: somebody who declined last Tuesday and
 * is shown it again on Wednesday has learned that finishing a run produces an
 * advert.
 */
export const DISCORD_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** localStorage key holding the last time the line was dismissed, as ms. */
export const DISCORD_DISMISSED_KEY = "sdg_discord_dismissed";

/**
 * Whether the line may be shown.
 *
 * Pure, and given both the clock and the stored value, so the rule can be
 * asserted without a browser and without waiting a week. `dismissedAt` is
 * whatever was in storage: a number, a malformed string, or nothing at all.
 *
 * A stored value from the future — a clock that was wrong when it was written,
 * or somebody editing storage — reads as "dismissed", not as "show it
 * forever". Erring towards silence is the right way round for this one.
 */
export function mayPromptDiscord(now: number, dismissedAt: unknown): boolean {
  if (dismissedAt === null || dismissedAt === undefined || dismissedAt === "") {
    return true;
  }
  const at = typeof dismissedAt === "number" ? dismissedAt : Number(dismissedAt);
  if (!Number.isFinite(at)) return true;
  if (at > now) return false;
  return now - at >= DISCORD_PROMPT_INTERVAL_MS;
}

/**
 * Whether this run earned the mention at all.
 *
 * A personal best or a medal. Explicitly not a finish — most finishes are not
 * an achievement, and the spec's own rule is "never show it after a failed
 * run". Written as a function taking the two facts rather than read off a run
 * object, so the condition is one expression a test can enumerate.
 */
export function runEarnedPrompt(opts: {
  finished: boolean;
  personalBest: boolean;
  medal: string | null;
}): boolean {
  if (!opts.finished) return false;
  return opts.personalBest || opts.medal !== null;
}
