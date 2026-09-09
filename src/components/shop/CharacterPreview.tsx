"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Avatar } from "@/components/play/Avatar";
import type { AvatarMotion } from "@/components/play/gait";
import { FrameLimiter } from "@/components/FrameLimiter";

/**
 * The character you are looking at buying, standing on a turntable.
 *
 * ── Why a live model and not a rendered thumbnail ────────────────────────
 *
 * A thumbnail would need a render pipeline, four PNGs in the repo, and a step
 * somebody has to remember after touching a model. It would also be a picture
 * of a T-pose, because that is what these GLBs are without the game running.
 * Mounting the real avatar costs one canvas on a page that has nothing else to
 * draw, and shows the thing you are actually buying: the idle breath, the
 * shoulders down out of the T, the character at the size it stands in the
 * world.
 *
 * ── Idle, deliberately ───────────────────────────────────────────────────
 *
 * The motion handed in is a standing one — no speed, on the ground — so `Gait`
 * produces its idle and nothing else. A walk cycle in a shop window would mean
 * inventing a speed, and the whole argument for driving these from physics is
 * that nobody invents a speed.
 *
 * That idle is a real pose rather than a held frame: breath, a slow arm sway, a
 * weight shift, and knees that are never locked straight. All of it is faded
 * out by `gait`, so it exists here and vanishes the moment the same character
 * is running around a world. A shop window is the one place in the game where
 * a character is looked at while doing nothing, so it is the one place where a
 * missing idle reads as a broken model rather than as a still moment.
 */

/** Standing still, on the ground. The gait's idle case. */
const IDLE: AvatarMotion = { moveSpeed: 0, isOnGround: true, verticalSpeed: 0 };

/**
 * Lifts the avatar's feet to the origin.
 *
 * Every avatar plants itself at `-(0.3 + 0.3 + 0.2)` below its parent, because
 * in game its parent is the middle of a floating physics capsule. There is no
 * capsule here, so that offset is undone rather than reproduced.
 */
const FLOOR_LIFT = 0.3 + 0.3 + 0.2;

/**
 * Frames whatever is in `subject` so the whole of it is on screen.
 *
 * ── The bug ──────────────────────────────────────────────────────────────
 *
 * The camera was a constant — `position: [0, 0.35, 2.6]`, fov 35 — chosen by
 * looking at one character. The roster is not one character: the Voidtouched
 * Mage is taller than the Emberforged Warrior and stands on a hat, so the same
 * camera cut its head off at the top of the box while leaving dead space under
 * its feet. A shop window that crops the thing it is selling is worse than no
 * shop window, and the failure is silent — nothing errors, the model is simply
 * partly outside the frustum.
 *
 * ── Why it measures rather than takes a per-character number ─────────────
 *
 * A `previewCameraY` field per character in `lib/characters.ts` would work
 * and would be wrong the first time somebody re-exports a GLB slightly taller.
 * The bounding box is derived from the thing itself, so it cannot go stale.
 *
 * ── Why it stops measuring ───────────────────────────────────────────────
 *
 * `Box3.setFromObject` walks the whole subtree, and the subject is a rig with
 * an idle animation on it, so measuring every frame would both cost something
 * and produce a camera that breathes in and out with the character. It
 * measures until the box settles — two consecutive frames agreeing — and then
 * stops until the character changes. That also handles the real sequencing
 * problem: the GLB arrives through Suspense some frames after this mounts, so
 * the first measurement is of an empty group.
 */
function FitCamera({
  subject,
  characterId,
}: {
  subject: React.RefObject<THREE.Group | null>;
  characterId: string;
}) {
  const settled = useRef(0);
  const lastSize = useRef(0);

  // A new character is a new measurement, whatever the last one concluded.
  useEffect(() => {
    settled.current = 0;
    lastSize.current = 0;
  }, [characterId]);

  // Module-scope scratch would be shared between two previews; these are per
  // instance and allocated once, which is the distinction CLAUDE.md draws for
  // materials — genuinely per-instance values get a per-instance cache.
  const box = useRef(new THREE.Box3()).current;
  const size = useRef(new THREE.Vector3()).current;
  const centre = useRef(new THREE.Vector3()).current;

  // The camera comes off the frame state rather than out of `useThree` in
  // render. Both are the same object, but capturing it in render and then
  // mutating it inside `useFrame` is what `react-hooks/immutability` rejects —
  // "cannot modify local variables after render completes" — and the rule is
  // pointing at something real: a value read in render is one React expects to
  // be stable for that render. Read per frame, it is a local.
  useFrame((state) => {
    if (settled.current >= 2 || !subject.current) return;
    const camera = state.camera;

    box.setFromObject(subject.current);
    if (box.isEmpty()) return;
    box.getSize(size);
    box.getCenter(centre);

    // ── Settling on height, and only height ──────────────────────────
    //
    // The subject is on a turntable, so its world-space box is different every
    // frame: X and Z sweep between the model's width and its depth, and reach
    // the diagonal of the two at 45°. A settle test over all three axes would
    // therefore never settle, and the camera would chase a box that is still
    // turning.
    //
    // Height is the one extent a Y rotation cannot change. It is also the
    // extent that actually decides the framing — every character in the roster
    // is taller than it is wide — so settling on it means the fit lands the
    // frame the GLB arrives and never moves again.
    const measured = size.y;
    settled.current =
      Math.abs(measured - lastSize.current) < 1e-4 ? settled.current + 1 : 0;
    lastSize.current = measured;

    // The distance at which whichever axis is tighter exactly fills the
    // frustum, then backed off so the model is framed rather than jammed
    // against the edges. Horizontal divides by the aspect, because a wide
    // preview box runs out of height first and a narrow one runs out of width.
    //
    // The horizontal extent is taken as the larger of X and Z: whatever the
    // turntable's current angle, the box is somewhere between the two, and
    // taking the larger can only ever leave MORE room. A conservative fit
    // shows a slightly small character; an optimistic one crops them, which is
    // the bug being fixed.
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = (persp.fov * Math.PI) / 180;
    const forHeight = size.y / 2 / Math.tan(vFov / 2);
    const forWidth =
      Math.max(size.x, size.z) / 2 / Math.tan(vFov / 2) / persp.aspect;
    const dist = Math.max(forHeight, forWidth) * PREVIEW_PADDING;

    // `.set()` in one call, never `camera.position.y = n` — assigning to a
    // member of something a hook returned is a `react-hooks/immutability`
    // error (CLAUDE.md).
    // Only the vertical centre is taken from the box. A model whose origin is
    // off-centre in X or Z would otherwise drag the camera sideways, and
    // because the subject is turning, "sideways" is a different direction every
    // frame — the fit would be measured at one angle and wrong at every other.
    // The turntable's axis is the origin, so that is where the camera looks.
    camera.position.set(0, centre.y, dist);
    camera.lookAt(0, centre.y, 0);
    persp.near = Math.max(0.01, dist - size.length());
    persp.far = dist + size.length() * 2;
    persp.updateProjectionMatrix();
  });

  return null;
}

/** How much clear space to leave around the model. 1 would be jammed in. */
const PREVIEW_PADDING = 1.35;

function Turntable({ characterId }: { characterId: string }) {
  const spin = useRef<THREE.Group>(null);
  // The camera measures the group that does NOT rotate: a spinning subject
  // sweeps a wider box on the diagonal than it occupies face on, so fitting to
  // the spinning one makes the model pulse smaller and larger as it turns.
  const subject = useRef<THREE.Group>(null);
  const motion = useRef<AvatarMotion>(IDLE);

  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.45;
  });

  return (
    <group ref={subject}>
      <FitCamera subject={subject} characterId={characterId} />
      <group ref={spin} position={[0, FLOOR_LIFT - 0.6, 0]}>
        {/* `hideUpClose` is off: that flag exists so the local player's own head
            does not fill the screen in first person, and it reads a camera rig
            this canvas does not have. */}
        <Avatar
          characterId={characterId}
          motionRef={motion}
          hideUpClose={false}
          // Not the courier. See the prop's note on <Avatar>: standing one
          // character in for another under the second one's name is not a
          // loading state, and the shop is the one place that matters.
          fallback={<Pedestal />}
        />
      </group>
    </group>
  );
}

/**
 * What stands there while the character is still arriving.
 *
 * A lit disc rather than nothing: an empty canvas reads as a failure, and a
 * canvas that goes from empty to a character reads as a pop. The disc gives
 * the eye somewhere to be and the model something to arrive onto.
 *
 * Deliberately not the courier and deliberately not a humanoid silhouette —
 * anything person-shaped would be mistaken for the character being bought,
 * which is the exact mistake this replaces.
 */
function Pedestal() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <ringGeometry args={[0.42, 0.5, 48]} />
      <meshBasicMaterial color="#2f3350" toneMapped={false} />
    </mesh>
  );
}

export function CharacterPreview({ characterId }: { characterId: string }) {
  return (
    <Canvas
      // Never "always": a 120Hz panel would render a shop window twice as often
      // as it can be seen. Same rule as every other canvas in the game.
      frameloop="never"
      dpr={[1, 2]}
      // A starting point only — <FitCamera> replaces it from the model's own
      // bounding box on the first settled frame. Kept close to the final
      // answer so there is no visible swing on mount.
      camera={{ position: [0, 0.35, 2.6], fov: 35 }}
      onCreated={({ gl, scene }) => {
        // The studio probe, exactly as the editor sets it up. Metal is lit by
        // the environment and by nothing else — without this the armour and
        // the buckles render black. See CLAUDE.md, "The sky".
        const pmrem = new THREE.PMREMGenerator(gl);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.55;
        pmrem.dispose();
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <FrameLimiter fps={60} />
      <hemisphereLight args={["#c8d2dd", "#4b5563", 1.15]} />
      <directionalLight position={[2.5, 4, 2]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.35} />
      <Turntable characterId={characterId} />
    </Canvas>
  );
}
