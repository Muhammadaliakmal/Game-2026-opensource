import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyLobby } from "@/components/party/PartyLobby";
import { isMatchCode, normalizeMatchCode } from "@/lib/match-code";

/**
 * One party, by code. A code is one evening's, so the page is never indexed;
 * the layout's canonical points at `/party`.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function PartyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isMatchCode(code)) notFound();
  return <PartyLobby code={normalizeMatchCode(code)} />;
}
