import test from "node:test";
import assert from "node:assert/strict";
import {
  DISCORD_INVITE,
  DISCORD_PROMPT_INTERVAL_MS,
  isDiscordInvite,
  mayPromptDiscord,
  runEarnedPrompt,
} from "./discord";

/**
 * The invite, and the rule about how often the site is allowed to mention it.
 *
 * Both halves are here because both are the kind of thing that is true when
 * it is written and silently false later: a deployment variable nobody checks,
 * and a "once a week" that turns out to be once a render.
 */

test("the shipped invite is a real Discord URL", () => {
  assert.equal(isDiscordInvite(DISCORD_INVITE), true);
  assert.match(DISCORD_INVITE, /^https:\/\//);
});

test("a bad override is refused rather than linked", () => {
  // The failure this prevents: a typo in a deployment variable becomes the
  // destination of the header link, the footer block and /discord at once,
  // and nobody clicks their own Discord link to find out.
  assert.equal(isDiscordInvite("discord.gg/abc"), false, "no scheme");
  assert.equal(isDiscordInvite("http://discord.gg/abc"), false, "not https");
  assert.equal(isDiscordInvite("https://example.com/discord"), false, "wrong host");
  assert.equal(isDiscordInvite("https://discord.gg.evil.com/x"), false, "lookalike host");
  assert.equal(isDiscordInvite(""), false);
  assert.equal(isDiscordInvite(undefined), false);
  assert.equal(isDiscordInvite(42), false);
  assert.equal(isDiscordInvite("javascript:alert(1)"), false);
});

test("real Discord hosts are accepted", () => {
  assert.equal(isDiscordInvite("https://discord.gg/QJz4Rcvax"), true);
  assert.equal(isDiscordInvite("https://discord.com/invite/QJz4Rcvax"), true);
});

test("never dismissed means the line may be shown", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  assert.equal(mayPromptDiscord(now, null), true);
  assert.equal(mayPromptDiscord(now, undefined), true);
  assert.equal(mayPromptDiscord(now, ""), true);
  // Malformed storage: somebody edited it, or a write was interrupted.
  assert.equal(mayPromptDiscord(now, "not-a-number"), true);
});

test("a dismissal buys exactly one week of silence", () => {
  const dismissed = Date.parse("2026-09-18T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  assert.equal(mayPromptDiscord(dismissed + day, dismissed), false);
  assert.equal(mayPromptDiscord(dismissed + 6 * day, dismissed), false);
  assert.equal(
    mayPromptDiscord(dismissed + DISCORD_PROMPT_INTERVAL_MS - 1, dismissed),
    false
  );
  assert.equal(
    mayPromptDiscord(dismissed + DISCORD_PROMPT_INTERVAL_MS, dismissed),
    true
  );
});

test("a dismissal stored in the future silences rather than repeats", () => {
  // A clock that was wrong when the value was written. Erring towards silence
  // is the right way round: the cost of staying quiet is one missed mention,
  // and the cost of the other choice is the line on every single run.
  const now = Date.parse("2026-09-18T12:00:00Z");
  assert.equal(mayPromptDiscord(now, now + 1_000_000), false);
});

test("only a good run earns the mention", () => {
  const medal = (m: string | null) => ({ finished: true, personalBest: false, medal: m });
  assert.equal(runEarnedPrompt({ finished: true, personalBest: true, medal: null }), true);
  assert.equal(runEarnedPrompt(medal("gold")), true);
  assert.equal(runEarnedPrompt(medal(null)), false, "a finish alone is not an achievement");
});

test("a run that was not finished never earns it", () => {
  // The spec's own line: "Never show it after a failed run." A player who just
  // fell off the course is the last person to be asked to join anything.
  assert.equal(
    runEarnedPrompt({ finished: false, personalBest: true, medal: "gold" }),
    false
  );
});
