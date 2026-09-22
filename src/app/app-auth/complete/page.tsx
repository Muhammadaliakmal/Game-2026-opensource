import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { PageShell, PageHeader } from "@/components/PageShell";
import { appAuthIntentUrl } from "@/lib/capacitor-identity";
import { ReturnToApp } from "./ReturnToApp";

/**
 * The half of the app's Google sign-in that runs in Chrome.
 *
 * The app opens this page in the system browser when its WebView tries to
 * reach Google's sign-in page (see `MainActivity`). Here Google works: the
 * visitor signs in normally, and this page mints a short-lived, single-use
 * Clerk sign-in token for that account and hands it back to the app, which
 * redeems it at `/app-auth/ticket`.
 *
 * It shows which account it is about to hand over, because Chrome may already
 * be signed in to the site as somebody — and returning the wrong account to
 * the app silently would be worse than asking.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Return to the app",
  robots: { index: false, follow: false },
};

/** Long enough to tap a button, short enough to be useless if it leaks. */
const TICKET_SECONDS = 120;

export default async function AppAuthCompletePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent("/app-auth/complete")}`);
  }

  const client = await clerkClient();
  const [{ token }, user] = await Promise.all([
    client.signInTokens.createSignInToken({ userId, expiresInSeconds: TICKET_SECONDS }),
    currentUser(),
  ]);
  const who =
    user?.primaryEmailAddress?.emailAddress ?? user?.username ?? user?.firstName ?? "your account";

  return (
    <PageShell width="prose">
      <PageHeader title="Return to the app">
        <p className="text-dim text-sm">
          Signed in as <span className="text-ink">{who}</span>.
        </p>
      </PageHeader>
      <ReturnToApp href={appAuthIntentUrl(token)} />
      <p className="text-dim text-xs">
        Not the right account? Sign out on this site in your browser, then
        choose Continue with Google in the app again.
      </p>
    </PageShell>
  );
}
