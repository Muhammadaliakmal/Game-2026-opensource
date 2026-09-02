/**
 * Cell keys, kept apart from the rest of grid.ts on purpose: the room server
 * (server/) needs `keyOf` to apply an op, and everything else in grid.ts pulls
 * in three.js. A headless Node process has no business importing a renderer.
 */
export const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

export const parseKey = (key: string): [number, number, number] => {
  const [x, y, z] = key.split(",").map(Number);
  return [x, y, z];
};
