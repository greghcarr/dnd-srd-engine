// Slice 841: disease-generic-condition — the audit's "No generic `diseased`
// condition; each disease is bespoke" finding is NOT A BUG in SRD 5.2.1. The
// 2024 SRD removed diseases as a mechanic: "Diseased" is not one of the 15
// conditions, "disease" appears nowhere in the rules glossary or monster text,
// the only spell mentioning it is "Detect Poison and Disease" (a detection
// spell — Lesser/Greater Restoration + Heal cure conditions, not diseases), and
// the lone disease-flavored effect (the Death Dog's) is modeled as the Poisoned
// condition + a bespoke recurring-save rider. A generic `diseased` condition
// would be edition drift. The engine's `category: 'disease'` taxonomy (the
// mirror of `category: 'curse'`) is the correct generalization. This guard pins
// the conclusion so a future edit can't re-introduce the 2014 disease mechanic.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';

const PACK = loadStarterPack();
// The 14 standard SRD 5.2.1 conditions modeled as pack conditions (Exhaustion is
// a numeric Character field, not a condition row). Diseased is deliberately NOT
// in this set — it isn't a 2024 condition.
const RAW_CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated',
  'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained',
  'stunned', 'unconscious',
];

describe('disease-generic-condition is NOT A BUG: 2024 SRD has no generic Diseased condition (slice 841)', () => {
  it('there is no generic "Diseased" condition (the 14 RAW condition rows do not include it)', () => {
    const ids = new Set(PACK.conditions.map((c) => c.id));
    for (const r of RAW_CONDITIONS) expect(ids.has(r), r).toBe(true);
    expect(RAW_CONDITIONS).not.toContain('diseased');
    expect(ids.has('diseased')).toBe(false);
    expect(PACK.conditions.some((c) => /^diseased$/i.test(c.name ?? '')), 'a condition named "Diseased"').toBe(false);
  });

  it('diseases are bespoke: the lone `category: disease` condition is the Death Dog disease, a Poisoned-variant with its own recurring-save cure path', () => {
    const diseases = PACK.conditions.filter((c) => c.category === 'disease');
    // Exactly one disease, modeled per-disease (not via a shared generic mechanic).
    expect(diseases.map((c) => c.id)).toEqual(['death-dog-disease-active']);
    // It carries its own cure path — the RAW 24h recurring CON save — rather
    // than a generic disease-cure mechanism (which 2024 doesn't have).
    expect(diseases[0]!.recurringSave).toBeDefined();
  });
});
