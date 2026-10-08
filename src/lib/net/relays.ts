/**
 * The public Nostr relays that carry the WebRTC introduction for parties and
 * races (`net/party.ts`, `net/race.ts`). Only the introduction: once two
 * browsers have swapped a few hundred bytes they talk directly, and the
 * relays see nothing else — and what they do see is encrypted with the code.
 *
 * Pinned rather than Trystero's built-in list, because that list goes stale:
 * on 8 Oct 2026 several of its entries no longer resolved, and Trystero picks
 * a handful from it, so two phones could each pick mostly dead relays and
 * never meet. Every room joins ALL of these (`redundancy` = the count), so one
 * relay going down costs nothing. Checked live that day; if parties stop
 * finding each other, check these first.
 */
export const RELAY_URLS = [
  "wss://nos.lol",
  "wss://nostr.mom",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://offchain.pub",
];

export const relayConfig = { urls: RELAY_URLS, redundancy: RELAY_URLS.length };
