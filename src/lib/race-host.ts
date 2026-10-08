/**
 * Which race this tab opened. The opener hosts it — its browser runs the race
 * (`lib/net/race.ts`) — and everyone following the link joins as a rider.
 *
 * Session storage: a reload keeps it, another tab does not.
 */
const key = (code: string) => `sdg-race-host:${code}`;

export function markRaceHost(code: string) {
  try {
    sessionStorage.setItem(key(code), "1");
  } catch {
    /* Private mode: this tab will not remember it opened the race. */
  }
}

export function isRaceHost(code: string): boolean {
  try {
    return sessionStorage.getItem(key(code)) === "1";
  } catch {
    return false;
  }
}
