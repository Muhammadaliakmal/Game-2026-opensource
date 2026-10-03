"use client";

import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CHARACTERS, characterFor } from "@/lib/characters";
import { isUnlocked, useShop } from "@/lib/shop";
import { MAX_PER_COURSE } from "@/lib/coins";

/**
 * The shop.
 *
 * ── One preview, not four ────────────────────────────────────────────────
 *
 * The obvious layout is a grid of cards each with its own little 3D window,
 * and it is the wrong one: four canvases means four WebGL contexts and four
 * skinned meshes animating at once, on a page whose entire job is to show one
 * character at a time. So the cards are cheap DOM, and the character you have
 * selected gets the only canvas.
 *
 * ── Buying and wearing are two presses ───────────────────────────────────
 *
 * A shop that equips what you just bought sounds helpful until you buy the
 * third character to look at it and find you are wearing it. Buy puts it in
 * your wardrobe; Equip puts it on. The button changes to the second the moment
 * the first succeeds, so it is one press after another rather than a step
 * anybody has to go looking for.
 */

// The canvas is browser-only, and the page around it is worth rendering on the
// server — so the 3D half arrives separately. Same split as WorldMount.
const CharacterPreview = dynamic(
  () => import("./CharacterPreview").then((m) => m.CharacterPreview),
  {
    ssr: false,
    loading: () => <div className="text-dim grid h-full place-items-center text-xs">…</div>,
  }
);

export function Shop() {
  const { coins, owned, character, signedIn, loaded, busy, error, load, buy, equip } =
    useShop();
  /*
   * What is on the turntable, which is not the same as what you are wearing —
   * browsing is the whole point of a shop.
   *
   * Stored as "what the visitor picked, if anything" rather than as the
   * selection itself, so that until they pick, the page follows whoever they
   * are wearing. The obvious version of that is an effect that copies
   * `character` into state whenever it changes, and that is exactly the
   * pattern `react-hooks/set-state-in-effect` rejects (see CLAUDE.md) — and a
   * render too late besides. Holding the choice makes "show what I am wearing"
   * a derivation instead of an action, the same shape SiteNav's menu uses.
   */
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selected = characterFor(pickedId ?? character);

  useEffect(() => {
    void load();
  }, [load]);
  const unlocked = isUnlocked(selected.id, owned);
  const worn = character === selected.id;
  const affordable = coins >= selected.price;

  return (
    <div data-mode="parkour" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-display font-bold">Characters</h1>
          <p className="text-dim text-sm">
            Finish courses to earn coins. A course pays up to {MAX_PER_COURSE} the
            first time you reach each medal on it — and nothing for running it
            again, so the coins come from getting better rather than from
            grinding.
          </p>
        </div>
        <div className="hud-panel hud-panel--readout flex items-center gap-2 px-4 py-2">
          <span className="text-accent text-lg leading-none">⬤</span>
          <span className="num text-lg font-semibold">{loaded ? coins : "—"}</span>
          <span className="hud-label">coins</span>
        </div>
      </header>

      {!signedIn && loaded && (
        <p className="hud-panel text-dim px-4 py-3 text-sm">
          You are not signed in, so nothing here can be earned or kept.{" "}
          <Link href="/sign-in" className="text-accent underline">
            Sign in
          </Link>{" "}
          and your coins start counting from your next finish.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── The one canvas ── */}
        <div className="hud-panel relative aspect-square w-full overflow-hidden">
          <CharacterPreview characterId={selected.id} />
          {worn && (
            <span className="hud-label bg-base/80 absolute top-3 left-3 rounded px-2 py-1">
              Wearing
            </span>
          )}
        </div>

        {/* ── Who it is, and what happens if you press the button ── */}
        <div className="flex flex-col justify-center gap-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: selected.accent }}>
              {selected.name}
            </h2>
            <p className="text-dim mt-1 text-sm">{selected.blurb}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {worn ? (
              <span className="hud-chip pointer-events-none px-6 py-3 opacity-70">
                Equipped
              </span>
            ) : unlocked ? (
              <button
                className="hud-chip hud-chip--primary px-6 py-3"
                disabled={busy !== null}
                onClick={() => void equip(selected.id)}
              >
                {busy === selected.id ? "Equipping…" : "Equip"}
              </button>
            ) : (
              <button
                className="hud-chip hud-chip--primary px-6 py-3 disabled:opacity-50"
                disabled={busy !== null || !affordable || !signedIn}
                onClick={() => void buy(selected.id)}
              >
                {busy === selected.id ? "Buying…" : `Buy · ⬤ ${selected.price}`}
              </button>
            )}

            {!unlocked && !affordable && signedIn && (
              <span className="hud-label">
                {selected.price - coins} more to go
              </span>
            )}
          </div>

          {error && <p className="text-dim text-xs">{error}</p>}

          <p className="text-dim text-xs">
            Everyone in a build room sees the character you are wearing. Racing
            puts you on a bike, which is nobody in particular.
          </p>
        </div>
      </div>

      {/* ── The rack ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CHARACTERS.map((c) => {
          const have = isUnlocked(c.id, owned);
          const active = c.id === selected.id;
          return (
            <button
              key={c.id}
              onClick={() => setPickedId(c.id)}
              className={`hud-panel flex flex-col items-start gap-1 px-3 py-3 text-left transition ${
                active ? "ring-accent ring-2" : "opacity-80 hover:opacity-100"
              }`}
            >
              <span
                className="h-1.5 w-8 rounded-full"
                style={{ background: c.accent }}
                aria-hidden
              />
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="hud-label num">
                {character === c.id
                  ? "Equipped"
                  : have
                    ? "Owned"
                    : `⬤ ${c.price}`}
              </span>
            </button>
          );
        })}
      </div>

      <SiteFooter />
    </div>
  );
}
