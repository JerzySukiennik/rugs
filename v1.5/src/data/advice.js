// Rug Rush cleaning advice: the safe way to remove each stain from each rug type, derived from the fibre rules.
import { FIBERS } from './fibers.js';

export const STAIN_KINDS = ['dust', 'hair', 'mud', 'sticky', 'wine', 'coffee', 'grease', 'urine', 'gum', 'wax', 'paint', 'mold'];

export function stainAdvice(kind, type) {
  const f = FIBERS[type] ?? FIBERS.cut;
  const silk = type === 'silk';
  const protein = type === 'persian' || silk;
  const waterOk = f.waterTol >= 0.5;
  const alkOk = f.alkTol >= 1;
  const brush = f.stiff ? 'stiff brush' : 'soft brush';
  switch (kind) {
    case 'dust':
      return f.beater ? 'Vacuum it' : 'Vacuum it with the beater bar off (RMB)';
    case 'hair':
      if (f.rubber) return 'Rubber brush to lift it, then vacuum';
      if (f.rake) return 'Rake it up, then vacuum';
      return 'Vacuum with the beater bar off (RMB)';
    case 'mud':
      return silk ? 'Let it dry, scrape the lumps gently, then vacuum' : `Let it dry, ${brush} it loose, then vacuum`;
    case 'sticky':
      if (!waterOk) return 'SICCARA dry compound, work it in with the soft brush while dry, then vacuum';
      return alkOk ? 'Shampoo, scrub, then rinse' : 'WOOLMARA pH-neutral shampoo, gentle soft-brush scrub, then rinse';
    case 'wine':
      if (f.oxTol >= 1) return 'OXILO oxygen spotter or TANNEX, scrub, then rinse';
      if (!waterOk) return 'TANNEX tannin spotter, dab it, keep the rug as dry as you can';
      return 'TANNEX tannin spotter, gentle scrub, then rinse. No oxygen or red dye remover here';
    case 'coffee':
      if (!waterOk) return 'TANNEX tannin spotter, dab it, keep the rug as dry as you can';
      return protein ? 'TANNEX tannin spotter, gentle soft-brush scrub, then rinse' : 'TANNEX tannin spotter, scrub, then rinse';
    case 'grease':
      return alkOk ? 'ABSORBIX powder, wait, vacuum. DEGREX + rinse for tough spots' : 'ABSORBIX absorbent powder, give it time, then vacuum';
    case 'urine':
      if (protein) return 'ACIDRA vinegar rinse, let it work, then rinse lightly. No enzymes on this rug';
      return waterOk ? 'ENZORA enzyme cleaner, let it dwell, then rinse' : 'ENZORA sparingly, let it dwell, keep the rug dry';
    case 'gum':
      return 'FROSTIK freeze spray, then scrape it off with the spatula';
    case 'wax':
      if (f.ironMax <= 0) return 'Scrape it off with the spatula. No iron on this rug';
      return f.ironMax === 1 ? 'Scrape, then iron over brown paper on the lowest heat' : 'Scrape, then iron over brown paper';
    case 'paint':
      if (f.solvTol >= 10) return 'THINRA white spirit or ALCOTOL alcohol, then scrape it off';
      return 'A light mist of ALCOTOL alcohol, then scrape. No white spirit, it runs the dyes';
    case 'mold':
      return waterOk ? 'MYCOSTOP anti-mould spray, let it work, vacuum, then dry it fast' : 'MYCOSTOP sparingly, let it work, then vacuum and keep it dry';
    default:
      return null;
  }
}
