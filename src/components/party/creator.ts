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
