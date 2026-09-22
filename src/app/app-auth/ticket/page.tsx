import type { Metadata } from "next";
import { RedeemTicket } from "./RedeemTicket";

/**
 * The half of the app's Google sign-in that runs inside the app: redeems the
 * ticket `/app-auth/complete` minted in Chrome. `MainActivity` opens this page
 * with the ticket in the fragment, which never reaches a server log.
 */
export const metadata: Metadata = {
  title: "Signing in",
  robots: { index: false, follow: false },
};

export default function AppAuthTicketPage() {
  return <RedeemTicket />;
}
