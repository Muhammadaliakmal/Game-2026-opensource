"use client";

/**
 * The Clerk session token a room join is authenticated with.
 *
 * Registered from the React tree (see components/RoomAuth.tsx) and read from
 * outside it, the same way the editor's op sink and the world source are wired
 * — the connection code is not a component and has no business holding hooks.
 *
 * Deliberately free of any `@colyseus/sdk` import: this module is pulled into
 * the root layout, and the landing page should not carry a multiplayer SDK it
 * never opens a socket with.
 */

export type TokenGetter = () => Promise<string | null>;

let provider: TokenGetter | null = null;
let waiting: (() => void)[] = [];

/**
 * How long a join waits for Clerk to finish loading.
 *
 * Without this, joining is a race the signed-in user can lose: a world that
 * loads from cache before Clerk hydrates would join as a guest, and the person
 * who owns the world would find they could not build in it. Three seconds is
 * far longer than hydration takes and still short enough that a broken Clerk
 * means a slow join rather than a hung one.
 */
const PROVIDER_WAIT_MS = 3000;

export function setRoomTokenProvider(next: TokenGetter | null) {
  provider = next;
  if (!next) return;
  const woken = waiting;
  waiting = [];
  for (const wake of woken) wake();
}

function waitForProvider(): Promise<void> {
  if (provider) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      waiting = waiting.filter((w) => w !== wake);
      resolve();
    }, PROVIDER_WAIT_MS);
    const wake = () => {
      clearTimeout(timer);
      resolve();
    };
    waiting.push(wake);
  });
}

/**
 * The token to present on join, or null to join as a guest.
 *
 * Never throws: a token that cannot be minted is a guest join, not a broken
 * page. The server decides what a guest may do — here, that is presence only.
 */
export async function roomToken(): Promise<string | null> {
  await waitForProvider();
  if (!provider) return null;
  try {
    return await provider();
  } catch {
    return null;
  }
}
