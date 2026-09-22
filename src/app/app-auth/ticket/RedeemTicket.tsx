"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";

export function RedeemTicket() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;

    if (isSignedIn) {
      router.replace("/");
      return;
    }

    const ticket = new URLSearchParams(window.location.hash.slice(1)).get("t");
    // Out of the address bar and the history before anything else happens.
    history.replaceState(null, "", window.location.pathname);

    void (async () => {
      if (!ticket) return setFailed(true);
      const { error } = await signIn.ticket({ ticket });
      if (error || signIn.status !== "complete") return setFailed(true);
      const done = await signIn.finalize();
      if (done.error) return setFailed(true);
      router.replace("/");
    })();
  }, [isLoaded, isSignedIn, signIn, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      {failed ? (
        <>
          <p className="text-ink text-sm">That sign-in link did not work.</p>
          <p className="text-dim text-xs">
            It may have expired — each one lasts two minutes and works once.
          </p>
          <Link href="/sign-in" className="hud-chip hud-chip--primary">
            Try again
          </Link>
        </>
      ) : (
        <p className="text-dim text-sm">Signing you in…</p>
      )}
    </div>
  );
}
