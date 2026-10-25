// Rug Rush fiber rules per rug type: tolerances that drive damage, drying speed and the printed care label.
export const FIBERS = {
  loop: {
    fiber: '100% POLYPROPYLENE', waterTol: 1, alkTol: 3, oxTol: 2.5, enzTol: 1, chlorTol: 0.95, solvTol: 12, bleedSolv: 0, acidTol: 1,
    ironMax: 1, beater: true, stiff: true, rake: true, rubber: true, bleedAlk: 0, bleedWet: 0, browning: 0, felting: 0, waterMarks: 0, dryRate: 1.25,
    care: { wash: { temp: 60 }, bleach: 'any', iron: 1, dry: 'P', notes: ['OLEFIN LOOP PILE', 'IRON WITH CLOTH ONLY'] },
  },
  cut: {
    fiber: '100% POLYESTER', waterTol: 1, alkTol: 2, oxTol: 2.5, enzTol: 1, chlorTol: 0.35, solvTol: 12, bleedSolv: 0.05, acidTol: 1,
    ironMax: 2, beater: true, stiff: true, rake: true, rubber: true, bleedAlk: 0.15, bleedWet: 0, browning: 0, felting: 0, waterMarks: 0, dryRate: 1,
    care: { wash: { temp: 40 }, bleach: 'nonChlorine', iron: 2, dry: 'P', notes: ['CUT PILE', 'NO CHLORINE'] },
  },
  shag: {
    fiber: '100% POLYESTER MICROFIBRE', waterTol: 1, alkTol: 2, oxTol: 2.5, enzTol: 1, chlorTol: 0.35, solvTol: 12, bleedSolv: 0.05, acidTol: 1,
    ironMax: 2, beater: false, stiff: false, rake: true, rubber: true, bleedAlk: 0.1, bleedWet: 0, browning: 0, felting: 0, waterMarks: 0, dryRate: 0.55,
    care: { wash: { temp: 30, bars: 1 }, bleach: 'nonChlorine', iron: 2, dry: 'P', notes: ['SHAG 45 MM', 'NO BEATER BAR', 'HAND BRUSH ONLY'] },
  },
  persian: {
    fiber: '100% WOOL PILE · COTTON WARP', waterTol: 1, alkTol: 0.22, oxTol: 0.1, enzTol: 0, chlorTol: 0, solvTol: 6, bleedSolv: 1, acidTol: 1,
    ironMax: 1, beater: false, stiff: false, rake: false, rubber: true, bleedAlk: 1, bleedWet: 0.05, browning: 0, felting: 1, waterMarks: 0, dryRate: 0.8,
    care: { wash: { hand: true }, bleach: 'none', iron: 1, dry: 'P', notes: ['HAND KNOTTED', 'pH NEUTRAL ONLY', 'NO ENZYMES · NO OXYGEN'] },
  },
  silk: {
    fiber: '100% SILK', waterTol: 0.15, alkTol: 0.05, oxTol: 0, enzTol: 0, chlorTol: 0, solvTol: 4, bleedSolv: 1, acidTol: 0.7,
    ironMax: 1, beater: false, stiff: false, rake: false, rubber: false, bleedAlk: 1, bleedWet: 0.8, browning: 0, felting: 0, waterMarks: 1, dryRate: 1,
    care: { wash: { no: true }, bleach: 'none', iron: 1, dry: 'F', notes: ['DRY CLEAN ONLY', 'NO WATER', 'NO BRUSHES'] },
  },
  sisal: {
    fiber: '100% SISAL', waterTol: 0.12, alkTol: 0.1, oxTol: 0, enzTol: 0.4, chlorTol: 0, solvTol: 4, bleedSolv: 0.3, acidTol: 0.5,
    ironMax: 0, beater: false, stiff: true, rake: false, rubber: true, bleedAlk: 0, bleedWet: 0, browning: 1, felting: 0, waterMarks: 1.5, dryRate: 0.9,
    care: { wash: { no: true }, bleach: 'none', iron: 0, dry: 'A', notes: ['NATURAL FIBRE', 'KEEP DRY', 'DRY COMPOUND ONLY'] },
  },
  kilim: {
    fiber: '100% COTTON', waterTol: 1, alkTol: 0.6, oxTol: 0.5, enzTol: 1, chlorTol: 0, solvTol: 6, bleedSolv: 0.6, acidTol: 1,
    ironMax: 3, beater: false, stiff: false, rake: false, rubber: true, bleedAlk: 0.5, bleedWet: 0.6, browning: 0.3, felting: 0, waterMarks: 0, dryRate: 1.1,
    care: { wash: { temp: 30 }, bleach: 'none', iron: 3, dry: 'P', notes: ['FLAT WEAVE', 'COLOURS MAY RUN', 'USE DYE-LOCK'] },
  },
};
