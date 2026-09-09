"use client";

import { Suspense, useEffect } from "react";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { characterFor } from "@/lib/characters";
import { designFor } from "@/lib/character-design";
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
 * ── There is only one kind now, and the second is kept on purpose ────────
 *
 * Every character in the catalogue is procedural: authored in
 * `lib/character-design.ts`, owned outright, and free to download. So this
 * chooser almost always takes the first branch.
 *
 * The GLB branch stays because the argument for it never depended on which
 * models happened to be in the roster. A GLB is a download, and a download can
 * be slow, refused, or served from a cache that is not warm yet — so anything
 * that suspends on one needs something underneath it, or a player is an
 * invisible pair of footsteps until it lands. The procedural build needs no
 * network at all, which is what makes it both the default AND the only honest
 * fallback: whatever stands in has to be the same character, and only code can
 * guarantee that.
 */
export function Avatar({
  characterId,
  handleRef,
  motionRef,
  hideUpClose = true,
  fallback,
}: {
  characterId: string;
  handleRef?: RefObject<EcctrlHandle | null>;
  motionRef?: RefObject<AvatarMotion | null>;
  hideUpClose?: boolean;
  /**
   * What to show while the GLB is in flight, when the courier is the wrong
   * answer.
   *
   * It is the right answer almost everywhere: in a world, a player whose
   * character has not arrived should still be a person running around. The
   * exception is the shop window, where the whole purpose of the canvas is to
   * show the specific character named beside it — so standing the courier in
   * for a Voidtouched Mage means the panel says one name and the pedestal
   * shows a different character, which is not a loading state, it is wrong
   * information. The shop passes an empty pedestal instead.
   */
  fallback?: React.ReactNode;
}) {
  const character = characterFor(characterId);

  // The procedural avatar, wearing this character's design. It is no longer
  // only a fallback: every character in the catalogue is procedural now (see
  // lib/character-design for why), so this is the ordinary path and the GLB
  // branch below is what is left in place for a properly licensed model.
  const built = (
    <CharacterModel
      handleRef={handleRef}
      motionRef={motionRef}
      hideUpClose={hideUpClose}
      design={designFor(character.id)}
    />
  );

  if (!character.url) return built;

  return (
    <Suspense fallback={fallback ?? built}>
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
