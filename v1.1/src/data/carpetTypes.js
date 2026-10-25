// Rug Rush carpet types: fibers, pile parameters, weights, sizes and pattern styles.
export const SIZES = {
  S: { width: 1.2, length: 1.8 },
  M: { width: 2.0, length: 3.0 },
  L: { width: 3.0, length: 4.0 },
};

export const CARPET_TYPES = {
  loop: {
    name: 'Loop-pile carpet',
    fiber: 'polypropylene',
    pile: { kind: 'loop', height: 0.006, density: 1.0, strand: 0.9, stiffness: 0.85 },
    backing: 0.004,
    kgPerM2: 2.2,
    bend: 0.7,
    sizes: ['M', 'L'],
    pattern: 'tweed',
    sheen: 0.15,
    basePrice: 35,
  },
  cut: {
    name: 'Cut-pile synthetic rug',
    fiber: 'polyester',
    pile: { kind: 'cut', height: 0.012, density: 0.9, strand: 0.7, stiffness: 0.6 },
    backing: 0.003,
    kgPerM2: 2.0,
    bend: 0.5,
    sizes: ['S', 'M', 'L'],
    pattern: 'modern',
    sheen: 0.3,
    basePrice: 45,
  },
  shag: {
    name: 'Shag rug',
    fiber: 'polyester microfiber',
    pile: { kind: 'shag', height: 0.045, density: 0.75, strand: 1.0, stiffness: 0.25 },
    backing: 0.004,
    kgPerM2: 3.0,
    bend: 0.35,
    sizes: ['S', 'M'],
    pattern: 'solid',
    sheen: 0.45,
    basePrice: 60,
  },
  persian: {
    name: 'Hand-knotted wool Persian',
    fiber: 'wool',
    pile: { kind: 'dense', height: 0.008, density: 1.0, strand: 0.55, stiffness: 0.7 },
    backing: 0.003,
    kgPerM2: 3.5,
    bend: 0.45,
    sizes: ['S', 'M', 'L'],
    pattern: 'persian',
    sheen: 0.2,
    basePrice: 140,
  },
  silk: {
    name: 'Silk rug',
    fiber: 'silk',
    pile: { kind: 'dense', height: 0.005, density: 1.0, strand: 0.4, stiffness: 0.5 },
    backing: 0.002,
    kgPerM2: 2.4,
    bend: 0.3,
    sizes: ['S', 'M'],
    pattern: 'silk',
    sheen: 0.95,
    basePrice: 260,
  },
  sisal: {
    name: 'Sisal rug',
    fiber: 'sisal',
    pile: { kind: 'flat', height: 0.0, density: 1.0, strand: 1.0, stiffness: 1.0 },
    backing: 0.007,
    kgPerM2: 2.1,
    bend: 0.9,
    sizes: ['M', 'L'],
    pattern: 'sisal',
    sheen: 0.05,
    basePrice: 50,
  },
  kilim: {
    name: 'Cotton kilim',
    fiber: 'cotton',
    pile: { kind: 'flat', height: 0.0, density: 1.0, strand: 1.0, stiffness: 1.0 },
    backing: 0.004,
    kgPerM2: 1.5,
    bend: 0.2,
    sizes: ['S', 'M', 'L'],
    pattern: 'kilim',
    sheen: 0.08,
    basePrice: 55,
  },
};

export function carpetThickness(type) {
  const t = CARPET_TYPES[type];
  return t.backing + t.pile.height * 0.6;
}

export function rolledRadius(type, lengthM, coreRadius = 0.025) {
  return Math.sqrt(coreRadius * coreRadius + (carpetThickness(type) * lengthM) / Math.PI);
}

export function carpetMass(type, sizeOrDims) {
  const d = typeof sizeOrDims === 'string' ? SIZES[sizeOrDims] : sizeOrDims;
  return CARPET_TYPES[type].kgPerM2 * d.width * d.length;
}
