// Rug Rush world layout: station positions and the shared wash-bay floor height function.
export const TILE = 0.3;
export const GROUT_W = 0.004;
export const GROUT_DEPTH = 0.002;

export const BAY = {
  cx: 0,
  cz: -3,
  half: 6,
  depth: 0.06,
  edgeRamp: 1.5,
  trench: { halfLen: 4.5, halfW: 0.075, depth: 0.12 },
};

export const LAYOUT = {
  ground: { half: 40 },
  hall: { minX: -20, maxX: 20, minZ: -15, maxZ: 15, height: 7, chordY: 6.3 },
  inboundDock: { x: 20, z: -8, door: 4.5 },
  outboundDock: { x: 20, z: 8, door: 4.5 },
  shelves: [{ x: -9.2, z: -6.5, rotY: Math.PI / 2 }, { x: -9.2, z: -1.5, rotY: Math.PI / 2 }],
  dryingRacks: [{ x: -5, z: 8.5 }, { x: -1, z: 8.5 }],
  dryer: { x: -3, z: 11.5 },
  roller: { x: 9, z: 6 },
  hoseBoom: { x: 0, y: 4.6, z: -3, arm: 3.2, hose: 5.2 },
  computer: { x: -9, z: 6 },
  trash: { x: 12, z: -13 },
  courierDrop: { x: 16, z: -13 },
  spawn: { x: 0, z: 8 },
};

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function inBay(x, z, margin = 0) {
  return Math.abs(x - BAY.cx) <= BAY.half + margin && Math.abs(z - BAY.cz) <= BAY.half + margin;
}

export function inTrench(x, z) {
  return Math.abs(z - BAY.cz) <= BAY.trench.halfW && Math.abs(x - BAY.cx) <= BAY.trench.halfLen;
}

export function floorBaseHeightAt(x, z) {
  const dx = Math.abs(x - BAY.cx);
  const dz = Math.abs(z - BAY.cz);
  if (dx >= BAY.half || dz >= BAY.half) return 0;
  const f = 1 - dz / BAY.half;
  const g = clamp01((BAY.half - dx) / BAY.edgeRamp);
  return -BAY.depth * f * g;
}

export function groutAt(x, z) {
  const fx = Math.abs(((x / TILE) % 1 + 1) % 1 - 0.5);
  const fz = Math.abs(((z / TILE) % 1 + 1) % 1 - 0.5);
  const e = 0.5 - GROUT_W / 2 / TILE;
  return fx > e || fz > e;
}

export function floorHeightAt(x, z, { grout = true, trench = true } = {}) {
  if (trench && inTrench(x, z)) return floorBaseHeightAt(x, z) - BAY.trench.depth;
  const h = floorBaseHeightAt(x, z);
  return grout && groutAt(x, z) ? h - GROUT_DEPTH : h;
}
