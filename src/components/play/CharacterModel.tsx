"use client";

import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { RefObject } from "react";
import type { EcctrlHandle } from "ecctrl";
import { FEEL } from "@/lib/feel";
import { DESIGNS, type CharacterDesign } from "@/lib/character-design";
import { glow, solid } from "./block-materials";
import { Gait, type AvatarMotion } from "./gait";
import { look } from "./camera-rig";

/**
 * The player avatar: a small voxel courier with a lit visor.
 *
 * Built from primitives rather than a GLB, and still the default: it costs no
 * download at all, so it is what the game can always draw. The shop's GLB
 * characters are the alternative, and `CharacterRig` draws those.
 *
 * Both are driven from the live EcctrlHandle through the same `Gait`, so the
 * animation always matches the physics rather than being a clip that drifts
 * out of sync — and so the two kinds of avatar standing next to each other in
 * a room move alike.
 *
 * The model is cosmetic only; nothing here touches physics. But it has to be
 * planted on the same ground the collider is standing on, or the character
 * reads as hovering — see GROUND_OFFSET.
 */

// Geometry is shared across every instance — one allocation per shape, ever.
const G = {
  head: new RoundedBoxGeometry(0.44, 0.36, 0.4, 3, 0.07),
  visor: new RoundedBoxGeometry(0.34, 0.13, 0.06, 2, 0.03),
  torso: new RoundedBoxGeometry(0.4, 0.44, 0.3, 3, 0.08),
  /**
   * Half a limb. The limbs used to be one 0.3-tall box each, which is why the
   * courier could not have knees — there was nothing below the hip to bend.
   * Two segments of 0.15 with a joint between them occupy exactly the same
   * space when straight, so the silhouette standing still is unchanged.
   */
  limb: new RoundedBoxGeometry(0.12, 0.15, 0.13, 2, 0.045),
  core: new THREE.SphereGeometry(0.055, 12, 12),
  antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6),

  /* ── Crest and trim ───────────────────────────────────────────────────
     The additive parts that give each design its silhouette. All at module
     scope, like everything above: five characters on a start grid would
     otherwise be five copies of an identical horn. */
  horn: new THREE.ConeGeometry(0.055, 0.2, 5),
  brim: new THREE.CylinderGeometry(0.34, 0.34, 0.035, 12),
  crown: new THREE.ConeGeometry(0.15, 0.22, 8),
  spine: new RoundedBoxGeometry(0.05, 0.14, 0.05, 1, 0.018),
  pauldron: new RoundedBoxGeometry(0.19, 0.11, 0.24, 2, 0.05),
  pack: new RoundedBoxGeometry(0.3, 0.28, 0.12, 2, 0.05),
};

/** Where the knee and elbow sit below their hip and shoulder. */
const JOINT_Y = -0.15;

/**
 * The model is built facing its own local -Z, and then the whole thing is
 * turned around by MODEL_FACING (below) so that it faces +Z in the space its
 * parent gives it.
 *
 * That is not decoration, it is the contract with the physics: ecctrl's
 * `turnCharacter` rotates the rigid body until its local **+Z** points along
 * the direction of travel (`characterZAxis` starts life as `(0, 0, 1)`). The
 * avatar used to be dropped in facing -Z, so it ran, jumped and landed with
 * the back of its head pointed at wherever it was going — visibly backwards in
 * third person, and the reason the character looked wrong when steered with a
 * thumbstick.
 *
 * Everything inside the flip stays in the original -Z space, so the forward
 * lean and the gait keep their signs and stay consistent with the face.
 */
const MODEL_FACING = Math.PI;

/**
 * Drops the model so its soles meet the floor.
 *
 * ecctrl holds the capsule on a spring a `floatHeight` gap above the ground,
 * so the contact point is not the body origin: it's
 * `-(capsuleHalfHeight + capsuleRadius + floatHeight)` = -(0.3 + 0.3 + 0.2).
 * The limbs bottom out at -0.54 in model space, so without this the character
 * renders a quarter of a unit in the air.
 *
 * These must stay in step with the <Ecctrl> props in Player.tsx.
 */
const CONTACT_Y = -(0.3 + 0.3 + 0.2);
const SOLE_Y = -0.54;
const GROUND_OFFSET = CONTACT_Y - SOLE_Y;

/**
 * What a character wears on its head.
 *
 * ── Why the silhouette matters more than the colour ──────────────────────
 *
 * Both worlds these characters run in are dark — Play and Race are night
 * scenes (CLAUDE.md, "The sky") — and a character is usually seen from behind
 * at fifteen metres, backlit by a neon kerb. Under those conditions hue is
 * almost the last thing that survives and outline is almost the first, so two
 * designs that differ only in palette are two designs nobody can tell apart
 * in the game they are worn in. Each crest changes the head's OUTLINE.
 *
 * They hang off the head group, so they nod with it and are folded correctly
 * by the seated pose without any of them knowing a bike exists.
 */
function Crest({ design }: { design: CharacterDesign }) {
  if (design.crest === "horns") {
    return (
      <>
        <mesh
          geometry={G.horn}
          position={[-0.17, 0.19, 0]}
          rotation={[0, 0, 0.55]}
          material={solid(design.trim, 0.35, 0.4)}
          castShadow
        />
        <mesh
          geometry={G.horn}
          position={[0.17, 0.19, 0]}
          rotation={[0, 0, -0.55]}
          material={solid(design.trim, 0.35, 0.4)}
          castShadow
        />
      </>
    );
  }

  if (design.crest === "brim") {
    return (
      <>
        {/* The one horizontal line in the roster. A brim is readable from
            every angle including directly behind, which a horn is not. */}
        <mesh
          geometry={G.brim}
          position={[0, 0.18, 0]}
          material={solid(design.trim, 0.55, 0.05)}
          castShadow
        />
        <mesh
          geometry={G.crown}
          position={[0, 0.3, 0]}
          material={solid(design.trim, 0.55, 0.05)}
          castShadow
        />
      </>
    );
  }

  if (design.crest === "spines") {
    // Three, shortening outward, so the row reads as a ridge rather than as
    // three separate things stuck on.
    return (
      <>
        {[-0.11, 0, 0.11].map((x, i) => (
          <mesh
            key={x}
            geometry={G.spine}
            position={[x, 0.2 - i * 0, 0]}
            scale={[1, i === 1 ? 1.35 : 1, 1]}
            material={solid(design.trim, 0.3, 0.5)}
            castShadow
          />
        ))}
      </>
    );
  }

  // The courier's antenna, and the lit bead on the end of it.
  return (
    <>
      <mesh
        geometry={G.antenna}
        position={[0.13, 0.26, 0]}
        rotation={[0, 0, -0.25]}
        material={solid(design.trim, 0.3, 0.8)}
      />
      <mesh
        geometry={G.core}
        position={[0.155, 0.36, 0]}
        scale={0.62}
        material={glow("#a3e635", 2.6)}
      />
    </>
  );
}

/**
 * Re-exported so the avatars, the peers and the net layer keep importing the
 * motion contract from one place. It is defined in `gait.ts`, next to the code
 * that consumes it.
 */
export type { AvatarMotion };

export function CharacterModel({
  handleRef,
  motionRef,
  /** Peers must not vanish because OUR camera is close to OUR own avatar. */
  hideUpClose = true,
  /**
   * Which character this is, as a skin over the one shared skeleton.
   *
   * A design changes colours and adds a crest, pauldrons or a pack. It does
   * NOT change a single joint offset, and that is the point: `gait.ts` walks
   * this hierarchy, `character-rig.ts` folds it onto a bike, and ecctrl plants
   * it on the ground at a fixed `SOLE_Y`. Four characters that share a
   * skeleton are four characters that provably move alike — and one whose
   * proportions differed would have to be re-checked against all three.
   */
  design = DESIGNS.courier,
}: {
  handleRef?: RefObject<EcctrlHandle | null>;
  motionRef?: RefObject<AvatarMotion | null>;
  hideUpClose?: boolean;
  design?: CharacterDesign;
}) {
  const outer = useRef<THREE.Group>(null!); // ground plant + facing flip
  const root = useRef<THREE.Group>(null!); // squash / lean
  const rig = useRef<THREE.Group>(null!); // bob
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const kneeL = useRef<THREE.Group>(null!);
  const kneeR = useRef<THREE.Group>(null!);
  const elbowL = useRef<THREE.Group>(null!);
  const elbowR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const visorMat = useRef<THREE.MeshStandardMaterial>(null!);

  // The walk cycle itself. One per avatar instance, kept in a ref so nothing
  // here re-renders; see gait.ts for why the angles are its state and not
  // read back off these groups.
  const walk = useRef(new Gait());

  useFrame((state, dt) => {
    const h = handleRef?.current ?? motionRef?.current;
    if (!h || !root.current) return;
    const t = state.clock.elapsedTime;

    // Hide once the eye is inside the model. Keyed off the rig's live distance
    // rather than the first-person flag so it disappears partway through the
    // transition instead of popping at either end of it.
    if (hideUpClose) {
      root.current.visible = look.distance > 1.8;
      if (!root.current.visible) return;
    }

    walk.current.advance(outer.current, h, dt, t);
    const p = walk.current.pose;

    root.current.scale.set(
      1 + (FEEL.squashScale[0] - 1) * p.squash,
      1 + (FEEL.squashScale[1] - 1) * p.squash,
      1 + (FEEL.squashScale[2] - 1) * p.squash
    );
    root.current.rotation.x = p.lean;
    root.current.rotation.z = p.roll;

    legL.current.rotation.x = p.legL;
    legR.current.rotation.x = p.legR;
    armL.current.rotation.x = p.armL;
    armR.current.rotation.x = p.armR;
    // Flexes carry no sign of their own (see GaitPose). This model is authored
    // facing -Z, so a positive X rotation carries a limb forwards: a knee folds
    // the shin backwards and takes the minus, an elbow folds the forearm
    // forwards and does not.
    kneeL.current.rotation.x = -p.kneeL;
    kneeR.current.rotation.x = -p.kneeR;
    elbowL.current.rotation.x = p.elbowL;
    elbowR.current.rotation.x = p.elbowR;
    rig.current.position.y = p.bob;

    // Head counter-rotates slightly against the lean, so it stays level-ish.
    head.current.rotation.x = -p.lean * 0.6;

    // Visor pulses faster the harder you're moving — cheap "alive" signal.
    if (visorMat.current) {
      visorMat.current.emissiveIntensity =
        1.6 + Math.sin(t * (3 + p.gait * 6)) * 0.35 + p.gait * 0.6;
    }
  });

  return (
    // Static plant on the floor, and the half-turn that puts the visor on the
    // engine's forward axis; `root` stays free for squash and lean so those
    // still scale and pivot about the body rather than the feet.
    <group
      ref={outer}
      position={[0, GROUND_OFFSET, 0]}
      rotation={[0, MODEL_FACING, 0]}
    >
      <group ref={root}>
        <group ref={rig}>
          {/* ── Torso ──
              Every colour on the body comes from `design`, and every material
              comes out of the module-level cache, so two characters wearing
              the same palette share one material and four on a grid are still
              a handful of draw calls. */}
          <mesh
            geometry={G.torso}
            position={[0, -0.02, 0]}
            material={solid(design.shell, 0.42, 0.25)}
            castShadow
          />
          {/* Chest core */}
          <mesh
            geometry={G.core}
            position={[0, 0.02, -0.15]}
            material={glow(design.glow, 2.4)}
          />
          {design.pack && (
            /* On the back, so it changes the profile without touching the
               face — which is the half of the silhouette a player sees of
               everyone else and never of themselves. */
            <mesh
              geometry={G.pack}
              position={[0, 0.0, 0.19]}
              material={solid(design.trim, 0.5, 0.15)}
              castShadow
            />
          )}
          {design.pauldrons && (
            <>
              <mesh
                geometry={G.pauldron}
                position={[-0.27, 0.2, 0]}
                material={solid(design.trim, 0.4, 0.35)}
                castShadow
              />
              <mesh
                geometry={G.pauldron}
                position={[0.27, 0.2, 0]}
                material={solid(design.trim, 0.4, 0.35)}
                castShadow
              />
            </>
          )}

          {/* ── Head ── */}
          <group ref={head} position={[0, 0.42, 0]}>
            <mesh
              geometry={G.head}
              material={solid(design.shell, 0.35, 0.1)}
              castShadow
            />
            {/* Visor reads as the "face", so forward direction is
                unmistakable. Local -Z, which MODEL_FACING turns into world
                forward.

                This is the one material NOT taken from the cache: its
                emissive intensity is animated per instance — the visor dims
                on a hard landing — and a shared material would blink every
                character on screen together. */}
            <mesh geometry={G.visor} position={[0, 0.01, -0.19]}>
              <meshStandardMaterial
                ref={visorMat}
                color="#0b1024"
                emissive={design.glow}
                emissiveIntensity={1.8}
                toneMapped={false}
              />
            </mesh>

            <Crest design={design} />
          </group>

          {/* ── Arms — shoulder, then a forearm hung off an elbow ──
              Each segment's mesh is offset half its own length below its
              pivot, so a joint rotates the segment about its top end the way
              a real one does. */}
          <group ref={armL} position={[-0.26, 0.14, 0]}>
            <mesh
              geometry={G.limb}
              position={[0, -0.075, 0]}
              material={solid(design.limb, 0.45, 0.2)}
              castShadow
            />
            <group ref={elbowL} position={[0, JOINT_Y, 0]}>
              <mesh
                geometry={G.limb}
                position={[0, -0.075, 0]}
                material={solid(design.limb, 0.45, 0.2)}
                castShadow
              />
            </group>
          </group>
          <group ref={armR} position={[0.26, 0.14, 0]}>
            <mesh
              geometry={G.limb}
              position={[0, -0.075, 0]}
              material={solid(design.limb, 0.45, 0.2)}
              castShadow
            />
            <group ref={elbowR} position={[0, JOINT_Y, 0]}>
              <mesh
                geometry={G.limb}
                position={[0, -0.075, 0]}
                material={solid(design.limb, 0.45, 0.2)}
                castShadow
              />
            </group>
          </group>

          {/* ── Legs — hip, then a shin hung off a knee ── */}
          <group ref={legL} position={[-0.1, -0.24, 0]}>
            <mesh
              geometry={G.limb}
              position={[0, -0.075, 0]}
              material={solid(design.boot, 0.5, 0.2)}
              castShadow
            />
            <group ref={kneeL} position={[0, JOINT_Y, 0]}>
              <mesh
                geometry={G.limb}
                position={[0, -0.075, 0]}
                material={solid(design.boot, 0.5, 0.2)}
                castShadow
              />
            </group>
          </group>
          <group ref={legR} position={[0.1, -0.24, 0]}>
            <mesh
              geometry={G.limb}
              position={[0, -0.075, 0]}
              material={solid(design.boot, 0.5, 0.2)}
              castShadow
            />
            <group ref={kneeR} position={[0, JOINT_Y, 0]}>
              <mesh
                geometry={G.limb}
                position={[0, -0.075, 0]}
                material={solid(design.boot, 0.5, 0.2)}
                castShadow
              />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
