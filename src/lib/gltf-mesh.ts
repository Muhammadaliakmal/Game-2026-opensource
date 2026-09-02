import * as THREE from "three";

/**
 * gltf-pipeline.ts joins every catalog prop down to a single mesh, so this is
 * always the whole model — but it goes through the whole scene graph rather
 * than assuming `scene.children[0]`, since useGLTF's root can wrap it in an
 * extra node depending on the exporter.
 */
export function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes[0] ?? null;
}
