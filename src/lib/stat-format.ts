/**
 * How a play count and a like count are written on a card.
 *
 * Pure, and in its own file, for the reason `lib/site-links.ts` gives: this is
 * the part of `<StatBadge>` worth testing and the component around it is the
 * part that cannot be.
 */

/**
 * Below this, a play count is not shown at all.
 *
 * ── Why a number nobody has played shows an em dash ──────────────────────
 *
 * Straight from the spec, and it is the most important line in the badge: "a
 * card that says '3 plays' actively discourages clicks." A low number is not
 * neutral information — it is an argument against pressing the card, made by
 * the card itself, at exactly the moment a new game most needs someone to try
 * it. An em dash says "not enough plays to say", which is both true and not an
 * argument either way.
 *
 * The threshold applies to plays only. A like count is a number somebody
 * chose to produce, so one like is a real fact about the game rather than a
 * sample too small to mean anything — and a heart with a dash beside it reads
 * as broken rather than as new.
 */
export const MIN_PLAYS_TO_SHOW = 50;

/** What is rendered instead of a number. An em dash, not a hyphen. */
export const NO_COUNT = "—";

/**
 * `1.2k`, `43.8k`, `1.1M`.
 *
 * One decimal place, and only where it adds something: `1.2k` is more useful
 * than `1k`, while `12.0k` is a decimal point spent on a zero. Truncated
 * rather than rounded, so a count never reads higher than it is — `999`
 * becoming `1.0k` would be a card claiming a thousand plays it has not had.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  const whole = Math.floor(n);
  if (whole < 1000) return String(whole);

  const scale = (value: number, suffix: string) => {
    const tenths = Math.floor(value * 10) / 10;
    // Under ten, keep the decimal: 1.2k carries information 1k does not.
    // At and above it, the decimal is noise on a number this approximate.
    return tenths < 10 ? `${tenths.toFixed(1)}${suffix}` : `${Math.floor(value)}${suffix}`;
  };

  if (whole < 1_000_000) return scale(whole / 1000, "k");
  if (whole < 1_000_000_000) return scale(whole / 1_000_000, "M");
  return scale(whole / 1_000_000_000, "B");
}

/** The play count as a card shows it, em dash included. */
export function formatPlays(plays: number | undefined): string {
  if (plays === undefined || plays < MIN_PLAYS_TO_SHOW) return NO_COUNT;
  return formatCount(plays);
}

/** The like count as a card shows it. Zero is shown, because zero is a fact. */
export function formatLikes(likes: number | undefined): string {
  return formatCount(likes ?? 0);
}

/**
 * What the badge says out loud, for anybody not reading the icons.
 *
 * "1.2k" beside a heart is legible as a picture and silent as a label, and the
 * badge is keyboard-reachable — so the accessible name has to be a sentence
 * rather than the same abbreviation read out.
 */
export function playsLabel(plays: number | undefined): string {
  if (plays === undefined || plays < MIN_PLAYS_TO_SHOW) return "Not enough plays yet";
  return `${plays.toLocaleString("en")} ${plays === 1 ? "play" : "plays"}`;
}

export function likesLabel(likes: number, liked: boolean): string {
  const count = `${likes.toLocaleString("en")} ${likes === 1 ? "like" : "likes"}`;
  return liked ? `${count}. You liked this — press to undo` : `${count}. Press to like`;
}
