"use client";

import { Suspense, useEffect } from "react";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { characterFor } from "@/lib/characters";
import { useShop } from "@/lib/shop";
import { CharacterModel } from "./CharacterModel";
import { CharacterRig } from "./CharacterRig";
import type { AvatarMotion } from "./gait";

/**
 * Whoever this player is wearing.
 *
 * The one place that decides between the two kinds of avatar, so neither
 * `Player` nor `Peers` has to know there are two. Both move identically — see
 * `gait.ts` — so everything above this point can treat an avatar as an avatar.
 *
 * ── The fallback is the courier, and that is not an accident ─────────────
 *
 * A GLB is a download, and a download can be slow, refused, or served from a
 * cache that is not warm yet. Suspending on it with nothing underneath would
 * leave a player as an invisible pair of footsteps for as long as that took.
 * The procedural avatar needs no network at all, so it stands in — the
 * character pops in when it arrives, and a player whose connection never
 * delivers it is still a person running around rather than a hole.
 */
export function Avatar({
  characterId,
  handleRef,
  motionRef,
  hideUpClose = true,
}: {
  characterId: string;
  handleRef?: RefObject<EcctrlHandle | null>;
  motionRef?: RefObject<AvatarMotion | null>;
  hideUpClose?: boolean;
}) {
  const character = characterFor(characterId);

  const courier = (
    <CharacterModel
      handleRef={handleRef}
      motionRef={motionRef}
      hideUpClose={hideUpClose}
    />
  );

  if (!character.url) return courier;

  return (
    <Suspense fallback={courier}>
      <CharacterRig
        characterId={character.id}
        handleRef={handleRef}
        motionRef={motionRef}
        hideUpClose={hideUpClose}
      />
    </Suspense>
  );
}

/**
 * The local player's own avatar.
 *
 * Reads the equipped id straight out of the shop store, which is hydrated
 * synchronously from the cache — so this is right on the first frame rather
 * than changing costume once a fetch lands. See `lib/shop.ts`.
 */
export function OwnAvatar({ handleRef }: { handleRef: RefObject<EcctrlHandle | null> }) {
  const characterId = useShop((s) => s.character);
  const ensureLoaded = useShop((s) => s.ensureLoaded);

  // The cache is right almost always and authoritative never — a player who
  // bought a character on their phone and opened the game on a laptop has a
  // cold cache and the wrong avatar until this lands. Once per page life; see
  // `ensureLoaded`.
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return <Avatar characterId={characterId} handleRef={handleRef} />;
}
