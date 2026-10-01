"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { clerkAppearanceFor } from "@/lib/clerk-appearance";
import { getPageTheme, getThemePref, subscribeThemePref } from "@/lib/theme";

/**
 * Hands Clerk the light palette when the page is light. Renders nothing.
 *
 * The provider sits in the server-rendered root layout with the dark
 * appearance, and Clerk only re-reads `appearance` when that prop changes —
 * which a client-side theme switch cannot make it do. So this pushes the
 * change through the method the provider itself calls for exactly that
 * (`__internal_updateProps`, in @clerk/react's ClerkProvider).
 *
 * It is an internal name, and that is accepted for the reason
 * `clerk-appearance.ts` accepts its `elements` keys: if Clerk renames it,
 * nothing throws and auth still works — the modal is simply dark on a light
 * page, which is what it was before this existed. Guarded rather than
 * assumed, so that is the whole failure.
 *
 * "Light" means what the CSS means: the light tokens and no game on screen
 * (tokens.css scopes them the same way, and `getPageTheme` asks the
 * document the same question), so a sign-in opened from inside a
 * game stays dark like the game. The pathname is a dependency because that
 * is when a game's marker comes and goes.
 */
type Updatable = { __internal_updateProps?: (p: { appearance: unknown }) => unknown };

export function ClerkThemeSync() {
  const clerk = useClerk() as unknown as Updatable;
  const pref = useSyncExternalStore(subscribeThemePref, getThemePref, () => "system");
  const pathname = usePathname();

  useEffect(() => {
    if (typeof clerk.__internal_updateProps !== "function") return;
    const light = getPageTheme() === "light";
    void clerk.__internal_updateProps({ appearance: clerkAppearanceFor(light ? "light" : "dark") });
  }, [clerk, pref, pathname]);

  return null;
}
