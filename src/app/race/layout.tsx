import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RACE } from "@/lib/features";
import { MAX_RIDERS, RACE_LAPS } from "@/lib/race-track";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Metadata for `/race`, which cannot declare its own.
 *
 * ── Why a layout exists for one page ─────────────────────────────────────
 *
 * `race/page.tsx` is `"use client"` — it holds the code field and the track
 * picker in state — and a client component cannot export `metadata`. Next
 * resolves metadata from the nearest server component above it, so a layout
 * is the only place this can live.
 *
 * Without it the page inherited the root layout's, which meant `/race` went
 * into the sitemap titled "Spec Driven Games" with the site's generic
 * description — identical to `/browse`, which had the same problem. Two
 * indexed URLs sharing one title and one description is a duplicate-content
 * signal on a domain that had just been rejected for content quality, and it
 * is invisible from the source: you only see it by reading the built HTML.
 *
 * The canonical matters for a second reason. `/race/<code>` opens from here
 * and people share those links; the codes are ephemeral, so consolidating on
 * the lobby is what stops a thousand dead room URLs being the thing Google
 * knows about this mode.
 */
export const metadata: Metadata = {
  title: `Race — ${MAX_RIDERS} riders, ${RACE_LAPS} laps · ${SITE_NAME}`,
  description: `Bikes on a neon loop. Up to ${MAX_RIDERS} riders over ${RACE_LAPS} laps, drifting to fill the boost. Open a room, share the code, no account needed.`,
  alternates: { canonical: `${SITE_URL}/race` },
  openGraph: {
    title: `Race · ${SITE_NAME}`,
    description: `Up to ${MAX_RIDERS} riders, ${RACE_LAPS} laps, on bikes. Pick a track and send the link.`,
    url: `${SITE_URL}/race`,
    images: [{ url: "/covers/circuit.png" }],
  },
};

export default function RaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Temporary (307), so a shared race link lands on the games list rather
  // than on "cannot connect" while there is no room server. See RACE.
  if (!RACE) redirect("/games");
  return children;
}
