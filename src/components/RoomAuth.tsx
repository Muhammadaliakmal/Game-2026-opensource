"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { setRoomTokenProvider, type TokenGetter } from "@/lib/net/token";

/**
 * Hands the room connection a way to mint a Clerk token, and renders nothing.
 *
 * It lives in the root layout because both room kinds — build and race —
 * reach for a token from outside React, and because registering it once
 * per app is the only version of this that has no ordering problem. Clerk's
 * `getToken` handles refresh itself, so this holds a getter rather than a
 * token: a socket opened an hour into a session still authenticates with a
 * live credential.
 */
export function RoomAuth() {
  const { getToken, isLoaded } = useAuth();

  // The identity of Clerk's getToken changes across renders; the getter we
  // register must not, or every render would look like a new provider.
  const latest = useRef(getToken);
  useEffect(() => {
    latest.current = getToken;
  }, [getToken]);

  useEffect(() => {
    // Registering before Clerk has loaded would answer null for a signed-in
    // user, which is precisely the race the wait in token.ts exists to lose.
    if (!isLoaded) return;
    const provider: TokenGetter = () => latest.current();
    setRoomTokenProvider(provider);
    return () => setRoomTokenProvider(null);
  }, [isLoaded]);

  return null;
}
