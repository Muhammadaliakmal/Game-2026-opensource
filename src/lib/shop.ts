"use client";

import { create } from "zustand";
import { DEFAULT_CHARACTER, characterFor } from "./characters";

/**
 * The wallet, client side.
 *
 * ── The cache is what stops the avatar changing under you ────────────────
 *
 * The equipped character is authoritative on the server, and a fetch takes a
 * moment. Without a local copy every world load would draw the courier first
 * and swap to your character when the request landed — a visible costume
 * change every time you press Play, on a screen where you are already moving.
 *
 * So the id is mirrored into `localStorage` and read synchronously at startup.
 * It is a *cache*, not a source of truth: the server's answer overwrites it
 * whenever one arrives, and nothing is ever bought or unlocked on the strength
 * of it. The worst a tampered cache achieves is showing its owner a character
 * they do not own, on their own screen, until the next load — and the room
 * server checks the id it is handed anyway.
 */

const EQUIPPED_KEY = "blockworld:character";

function readCached(): string {
  try {
    const id = localStorage.getItem(EQUIPPED_KEY);
    // Through the catalog rather than used raw: an id that no longer exists
    // resolves to the courier instead of to a model that cannot be loaded.
    return id ? characterFor(id).id : DEFAULT_CHARACTER;
  } catch {
    // Storage throws outright in some privacy modes rather than returning null.
    return DEFAULT_CHARACTER;
  }
}

function writeCached(id: string) {
  try {
    localStorage.setItem(EQUIPPED_KEY, id);
  } catch {
    /* nothing to recover — the server still knows */
  }
}

interface ShopState {
  coins: number;
  owned: string[];
  /** The character being worn. Always a real catalog id. */
  character: string;
  signedIn: boolean;
  /** True once the server has answered at least once. */
  loaded: boolean;
  busy: string | null;
  error: string | null;

  load(): Promise<void>;
  /**
   * Load once per page life. What the avatar calls: it needs the equipped
   * character to be right, and it must not turn every world load into a
   * refetch of a wallet that has not changed.
   */
  ensureLoaded(): Promise<void>;
  buy(id: string): Promise<void>;
  equip(id: string): Promise<void>;
}

export const useShop = create<ShopState>((set, get) => ({
  coins: 0,
  owned: [],
  // Read at store creation, which is the first moment anything can want it.
  character: typeof window === "undefined" ? DEFAULT_CHARACTER : readCached(),
  signedIn: false,
  loaded: false,
  busy: null,
  error: null,

  ensureLoaded: async () => {
    if (get().loaded || get().busy === "load") return;
    await get().load();
  },

  load: async () => {
    set({ busy: "load" });
    try {
      const res = await fetch("/api/shop");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const character = characterFor(data.character).id;
      writeCached(character);
      set({
        coins: data.coins ?? 0,
        owned: data.owned ?? [],
        character,
        signedIn: Boolean(data.signedIn),
        loaded: true,
        error: null,
      });
    } catch {
      // A shop that will not load is not the game. Keep whatever the cache
      // gave us and let the page say so in small text.
      set({ loaded: true, error: "Could not reach the shop." });
    } finally {
      set({ busy: null });
    }
  },

  buy: async (id) => {
    if (get().busy) return;
    set({ busy: id, error: null });
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        set({
          error:
            res.status === 402
              ? "Not enough coins yet."
              : res.status === 401
                ? "Sign in to buy characters."
                : "That did not go through.",
          ...(data?.owned ? { coins: data.coins, owned: data.owned } : {}),
        });
        return;
      }
      set({ coins: data.coins, owned: data.owned, character: data.character });
      // Bought is not worn. Equipping is a second, deliberate press, because
      // buying a character you were only curious about should not take the one
      // you are wearing off your back.
    } finally {
      set({ busy: null });
    }
  },

  equip: async (id) => {
    if (get().busy) return;
    const previous = get().character;
    // Optimistic: the avatar changes on the press. This is cosmetic and local,
    // and waiting a round trip to see yourself change is the one place in this
    // flow where the delay is actually felt.
    set({ busy: id, character: id, error: null });
    writeCached(id);
    try {
      const res = await fetch("/api/shop/equip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        set({
          character: previous,
          error:
            res.status === 401 ? "Sign in to change character." : "That did not stick.",
        });
        writeCached(previous);
        return;
      }
      set({ coins: data.coins, owned: data.owned, character: data.character });
      writeCached(data.character);
    } catch {
      set({ character: previous, error: "That did not stick." });
      writeCached(previous);
    } finally {
      set({ busy: null });
    }
  },
}));

/** Whether a character is available to wear: owned, or free for everybody. */
export function isUnlocked(id: string, owned: string[]): boolean {
  return characterFor(id).price === 0 || owned.includes(id);
}
