// Rug Rush cleaning products and tools: fictional brands, containers, physical form, chemistry agents, prices.
export const AGENTS = ['surf', 'alk', 'acid', 'ox', 'enz', 'solv', 'absorb', 'dryc', 'fix', 'fungi', 'cold', 'tannin', 'reducer', 'chlor', 'scent', 'encap'];

export const PRODUCTS = {
  lathera: {
    brand: 'LATHERA', name: 'Rug Shampoo for Synthetics', container: 'jerrycan', form: 'gel', color: '#2f7fd8',
    capacity: 5, rate: 0.12, agents: { surf: 1, alk: 0.55 }, foaminess: 1.2, price: 18,
    blurb: 'pH 9.5. Polypropylene, polyester, nylon. Not for wool, silk or natural fibres.',
  },
  woolmara: {
    brand: 'WOOLMARA', name: 'pH-Neutral Wool Shampoo', container: 'jug', form: 'gel', color: '#6fbf73',
    capacity: 2, rate: 0.08, agents: { surf: 0.9 }, foaminess: 1.0, price: 24,
    blurb: 'pH 7. Wool-safe. Gentle on dyes.',
  },
  bubblon: {
    brand: 'BUBBLON', name: 'Lemon Dish Soap', container: 'jug', form: 'gel', color: '#f2d33c',
    capacity: 1, rate: 0.07, agents: { surf: 1.3, alk: 0.15, scent: 0.3 }, foaminess: 2.2, price: 4,
    blurb: 'Household dish soap. Makes a LOT of foam.',
  },
  degrex: {
    brand: 'DEGREX', name: 'Heavy Degreaser', container: 'jerrycan', form: 'gel', color: '#e8792b',
    capacity: 5, rate: 0.1, agents: { alk: 1.1, surf: 0.5, solv: 0.25 }, foaminess: 0.6, price: 22,
    blurb: 'pH 12.5. Grease and oily soil on synthetics only.',
  },
  klorin: {
    brand: 'KLORIN', name: 'Thick Chlorine Bleach', container: 'jug', form: 'gel', color: '#e8f0ec',
    capacity: 1, rate: 0.07, agents: { chlor: 1, alk: 0.4 }, foaminess: 0.1, price: 3,
    blurb: 'Removes everything. Including colour. Including wool.',
  },
  oxilo: {
    brand: 'OXILO', name: 'Oxygen Spot Remover 3%', container: 'trigger', form: 'mist', color: '#f4f8ff',
    capacity: 0.5, rate: 0.012, agents: { ox: 0.8 }, price: 9,
    blurb: 'Hydrogen peroxide. Wine, coffee, residual colour. Test on wool.',
  },
  enzora: {
    brand: 'ENZORA', name: 'Enzyme Urine Eliminator', container: 'trigger', form: 'mist', color: '#9fd8ff',
    capacity: 0.5, rate: 0.012, agents: { enz: 1, scent: 0.2 }, price: 12,
    blurb: 'Digests urine. Let it dwell. Protein fibres (wool, silk): NO.',
  },
  solvane: {
    brand: 'SOLVANE', name: 'Dry Solvent Spotter', container: 'trigger', form: 'mist', color: '#e9e3c4',
    capacity: 0.5, rate: 0.012, agents: { solv: 1 }, price: 14,
    blurb: 'Oil, grease, paint, gum residue. No water.',
  },
  tannex: {
    brand: 'TANNEX', name: 'Coffee & Tannin Spotter', container: 'trigger', form: 'mist', color: '#c98b3a',
    capacity: 0.5, rate: 0.012, agents: { tannin: 1, acid: 0.35 }, price: 11,
    blurb: 'pH 3. Coffee, tea, wine tannins.',
  },
  redaway: {
    brand: 'REDAWAY', name: 'Red Dye Remover (PRO)', container: 'trigger', form: 'mist', color: '#ff7aa8',
    capacity: 0.5, rate: 0.012, agents: { reducer: 1 }, price: 16,
    blurb: 'Strips red dye. Also strips the rug. Careful.',
  },
  fixol: {
    brand: 'FIXOL', name: 'Dye-Lock Colour Fixer', container: 'trigger', form: 'mist', color: '#a98be0',
    capacity: 0.5, rate: 0.014, agents: { fix: 1, acid: 0.3 }, price: 13,
    blurb: 'Stops dyes running while the rug is wet. Spray before washing.',
  },
  mycostop: {
    brand: 'MYCOSTOP', name: 'Anti-Mould Treatment', container: 'trigger', form: 'mist', color: '#9ed6a5',
    capacity: 0.5, rate: 0.012, agents: { fungi: 1 }, price: 10,
    blurb: 'Kills mould. Dry the rug fast afterwards.',
  },
  acidra: {
    brand: 'ACIDRA', name: 'Vinegar Acid Rinse', container: 'trigger', form: 'mist', color: '#eef2df',
    capacity: 0.75, rate: 0.016, agents: { acid: 1 }, price: 6,
    blurb: 'Neutralises alkaline residue after shampoo. Locks dyes.',
  },
  alcotol: {
    brand: 'ALCOTOL', name: 'Isopropyl Alcohol 70%', container: 'trigger', form: 'mist', color: '#f0f6fa',
    capacity: 0.5, rate: 0.012, agents: { solv: 0.6 }, price: 7,
    blurb: 'Ink and dried latex. Dab, never rub.',
  },
  thinra: {
    brand: 'THINRA', name: 'White Spirit', container: 'jug', form: 'gel', color: '#f6f1d6',
    capacity: 1, rate: 0.06, agents: { solv: 1.6 }, foaminess: 0, price: 8,
    blurb: 'Oil paint thinner. Strong. Silk hates it.',
  },
  trax: {
    brand: 'TRAX', name: 'Traffic Lane Pre-Spray', container: 'trigger', form: 'mist', color: '#7fd1ff',
    capacity: 1, rate: 0.02, agents: { alk: 1.2, surf: 0.6 }, price: 15,
    blurb: 'pH 11.4. Walkways and heavy soil on synthetics.',
  },
  freshair: {
    brand: 'FRESHAIR', name: 'Fabric Deodoriser', container: 'trigger', form: 'mist', color: '#ffc0d9',
    capacity: 0.5, rate: 0.012, agents: { scent: 1 }, price: 5,
    blurb: 'Smells like a meadow. Cleans nothing.',
  },
  frostik: {
    brand: 'FROSTIK', name: 'Gum Freeze Spray', container: 'aerosol', form: 'mist', color: '#cfefff',
    capacity: 0.3, rate: 0.02, agents: { cold: 1 }, price: 9,
    blurb: 'Freezes gum and wax brittle. Then scrape.',
  },
  foamo: {
    brand: 'FOAMO', name: 'Dry Foam Rug Cleaner', container: 'aerosol', form: 'foam', color: '#ffffff',
    capacity: 0.6, rate: 0.02, agents: { surf: 0.7, encap: 0.8 }, foaminess: 1, price: 12,
    blurb: 'Low-moisture foam. Brush in, let dry, vacuum.',
  },
  absorbix: {
    brand: 'ABSORBIX', name: "Fuller's Earth Absorbent", container: 'tub', form: 'powder', color: '#cbb99a',
    capacity: 1.5, rate: 0.06, agents: { absorb: 1 }, price: 8,
    blurb: 'Pulls grease out of fibres. Leave it 30 s, then vacuum.',
  },
  sodalux: {
    brand: 'SODALUX', name: 'Baking Soda', container: 'shaker', form: 'powder', color: '#ffffff',
    capacity: 1, rate: 0.05, agents: { absorb: 0.55, alk: 0.3, scent: 0.3 }, price: 3,
    blurb: 'Absorbs and freshens. Alkaline: rinse it out of wool.',
  },
  starka: {
    brand: 'STARKA', name: 'Corn Starch', container: 'shaker', form: 'powder', color: '#fbf7ec',
    capacity: 1, rate: 0.05, agents: { absorb: 0.75 }, price: 3,
    blurb: 'Gentle absorbent. Safe on silk.',
  },
  oxipow: {
    brand: 'OXILO', name: 'Oxi Powder (percarbonate)', container: 'tub', form: 'powder', color: '#e9f3ff',
    capacity: 1, rate: 0.05, agents: { ox: 1.1, alk: 0.6 }, price: 10,
    blurb: 'Activates in water. Fizzes. Synthetics only.',
  },
  siccara: {
    brand: 'SICCARA', name: 'Dry Compound Cleaner', container: 'tub', form: 'powder', color: '#c9a77a',
    capacity: 2, rate: 0.07, agents: { dryc: 1, solv: 0.15 }, price: 20,
    blurb: 'Damp cleaning crumbs for sisal, jute and silk. Brush in, vacuum out.',
  },
  meadow: {
    brand: 'FRESHAIR', name: 'Carpet Fresh Powder', container: 'shaker', form: 'powder', color: '#ffb3cf',
    capacity: 0.7, rate: 0.05, agents: { scent: 1, absorb: 0.2 }, price: 5,
    blurb: 'Pink and fragrant.',
  },
  foamer: {
    brand: 'BUBBLON', name: 'PRO Foamer 2 L', container: 'foamer', form: 'foam', color: '#ffffff',
    capacity: 2, rate: 0.08, agents: { surf: 0.8, alk: 0.25 }, foaminess: 1.5, price: 45,
    blurb: 'Pump foam sprayer. Thick foam over everything.',
  },
};

export const TOOLS = {
  vacuum: { name: 'Upright Vacuum', price: 120, kind: 'vacuum', beater: true, wet: false, radius: 0.2 },
  wetvac: { name: 'Wet & Dry Vac', price: 160, kind: 'vacuum', beater: false, wet: true, radius: 0.17, tank: 15 },
  brushSoft: { name: 'Soft Brush', price: 9, kind: 'brush', strength: 0.5, radius: 0.12 },
  brushStiff: { name: 'Stiff Brush', price: 9, kind: 'brush', strength: 1.0, radius: 0.11 },
  brushRubber: { name: 'Rubber Pet Brush', price: 12, kind: 'brush', strength: 0.6, radius: 0.11, rubber: true },
  rake: { name: 'Rug Rake', price: 18, kind: 'brush', strength: 0.35, radius: 0.22, rake: true },
  squeegee: { name: 'Floor & Rug Squeegee', price: 25, kind: 'squeegee', width: 1.1 },
  scraper: { name: 'Bone Spatula', price: 6, kind: 'scraper', radius: 0.065 },
  iron: { name: 'Iron + Brown Paper', price: 35, kind: 'iron', radius: 0.1 },
  uvlamp: { name: 'UV Torch 365 nm', price: 22, kind: 'uvlamp' },
  blower: { name: 'Air Mover', price: 90, kind: 'blower' },
};

export const STARTING_STOCK = {
  lathera: 1, woolmara: 1, bubblon: 2, degrex: 1, klorin: 1, oxilo: 1, enzora: 1, solvane: 1, tannex: 1, redaway: 1,
  fixol: 1, mycostop: 1, acidra: 1, alcotol: 1, thinra: 1, trax: 1, freshair: 1, frostik: 1, foamo: 1,
  absorbix: 1, sodalux: 1, starka: 1, oxipow: 1, siccara: 1, meadow: 1, foamer: 1,
};

export const STARTING_TOOLS = ['vacuum', 'wetvac', 'brushSoft', 'brushStiff', 'brushRubber', 'rake', 'squeegee', 'scraper', 'iron', 'uvlamp', 'blower', 'blower'];
