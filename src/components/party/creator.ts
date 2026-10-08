/**
 * Which party this tab started. The creator hosts from the first frame; every
 * other browser waits to hear from a host (`lib/net/party-session.ts`).
 *
 * Session storage, so a reload keeps it and another tab does not. A reloaded
 * host arrives as a second host and yields to the party its heir kept running
 * — the session's collision rule handles that, not this.
 */
const key = (code: string) => `sdg-party-host:${code}`;

export function markPartyCreator(code: string) {
  try {
    sessionStorage.setItem(key(code), "1");
  } catch {
    /* Private mode: this tab simply will not remember it started the party. */
  }
}

export function isPartyCreator(code: string): boolean {
  try {
    return sessionStorage.getItem(key(code)) === "1";
  } catch {
    return false;
  }
}

/** The game a party was started for ("Compete nearby" on a cabinet), picked once it is live. */
const gameKey = (code: string) => `sdg-party-game:${code}`;

export function markPartyGame(code: string, game: string) {
  try {
    sessionStorage.setItem(gameKey(code), game);
  } catch {
    /* The host picks it by hand instead. */
  }
}

/** Read once: the pick happens a single time, and the host may change it after. */
export function takePartyGame(code: string): string | null {
  try {
    const g = sessionStorage.getItem(gameKey(code));
    sessionStorage.removeItem(gameKey(code));
    return g;
  } catch {
    return null;
  }
}

/** Where a cabinet's "Compete nearby" goes: a fresh party with this game picked. */
export const competeHref = (game: string) => `/party/new?game=${encodeURIComponent(game)}`;
