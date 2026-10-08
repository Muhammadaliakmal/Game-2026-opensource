import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PARTY } from "@/lib/features";
import { PARTY_MAX } from "@/lib/party-games";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Metadata for `/party`, whose page is a client component and cannot declare
 * its own — the same arrangement as `/race`, for the same reasons: a title of
 * its own, and a canonical on the lobby so the ephemeral `/party/<code>` links
 * people share are never what an index knows about this mode.
 */
export const metadata: Metadata = {
  title: `Party — play together on one Wi-Fi · ${SITE_NAME}`,
  description: `Up to ${PARTY_MAX} people on the same network, the same seed, and one scoreboard. Start a party and everyone nearby sees it. No account needed.`,
  alternates: { canonical: `${SITE_URL}/party` },
};

export default function PartyLayout({ children }: { children: React.ReactNode }) {
  // The switch is in lib/features.ts. Off, a shared party link lands on the
  // games list rather than on a page the site no longer offers.
  if (!PARTY) redirect("/games");
  return children;
}
