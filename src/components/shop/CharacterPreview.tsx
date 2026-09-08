"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useRef } from "react";
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
 * produces its idle breath and nothing else. A walk cycle in a shop window
 * would mean inventing a speed, and the whole argument for driving these from
 * physics is that nobody invents a speed.
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

function Turntable({ characterId }: { characterId: string }) {
  const spin = useRef<THREE.Group>(null);
  const motion = useRef<AvatarMotion>(IDLE);

  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.45;
  });

  return (
    <group ref={spin} position={[0, FLOOR_LIFT - 0.6, 0]}>
      {/* `hideUpClose` is off: that flag exists so the local player's own head
          does not fill the screen in first person, and it reads a camera rig
          this canvas does not have. */}
      <Avatar characterId={characterId} motionRef={motion} hideUpClose={false} />
    </group>
  );
}

export function CharacterPreview({ characterId }: { characterId: string }) {
  return (
    <Canvas
      // Never "always": a 120Hz panel would render a shop window twice as often
      // as it can be seen. Same rule as every other canvas in the game.
      frameloop="never"
      dpr={[1, 2]}
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
