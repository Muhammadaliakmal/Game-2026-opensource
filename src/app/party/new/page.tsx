"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GameLoader } from "@/components/hud/GameLoader";
import { markPartyCreator, markPartyGame } from "@/components/party/creator";
import { makeMatchCode } from "@/lib/match-code";
import { isPlayablePartyGame } from "@/lib/party-games";

/**
 * "Compete nearby" from a cabinet: a fresh party, hosted by this tab, with
 * that game already picked. A page rather than a function so a cabinet card
 * can link to it — the card is a stretched button, and a second button inside
 * it is not allowed, but a link in its `card-actions` is.
 *
 * The code is made here, in the browser, so the URL never carries one that
 * two people could open at once.
 */
export default function NewPartyPage() {
  const router = useRouter();
  useEffect(() => {
    const code = makeMatchCode();
    markPartyCreator(code);
    const game = new URLSearchParams(window.location.search).get("game");
    if (isPlayablePartyGame(game)) markPartyGame(code, game);
    router.replace(`/party/${code}`);
  }, [router]);
  return <GameLoader label="Starting a party" />;
}
