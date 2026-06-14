import type { Class, SpellcastingProgression } from '../schemas/content/class.js';
import type { Character, ClassEnrollment } from '../schemas/runtime/character.js';
import type { SpellLevel } from '../schemas/primitives.js';

const FULL_CASTER_SLOTS: ReadonlyArray<ReadonlyArray<number>> = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const PACT_SLOTS: ReadonlyArray<{ level: number; count: number }> = [
  { level: 1, count: 1 },
  { level: 1, count: 2 },
  { level: 2, count: 2 },
  { level: 2, count: 2 },
  { level: 3, count: 2 },
  { level: 3, count: 2 },
  { level: 4, count: 2 },
  { level: 4, count: 2 },
  { level: 5, count: 2 },
  { level: 5, count: 2 },
  { level: 5, count: 3 },
  { level: 5, count: 3 },
  { level: 5, count: 3 },
  { level: 5, count: 3 },
  { level: 5, count: 3 },
  { level: 5, count: 3 },
  { level: 5, count: 4 },
  { level: 5, count: 4 },
  { level: 5, count: 4 },
  { level: 5, count: 4 },
];

const casterLevelContribution = (
  enrollment: ClassEnrollment,
  progression: SpellcastingProgression | undefined,
): number => {
  if (!progression) return 0;
  switch (progression.type) {
    case 'full':
      return enrollment.level;
    case 'half':
      // PHB 2024 multiclassing + single-class half-caster tables:
      // contribution = level rounded UP. Paladin 5 -> caster level 3,
      // mapping to 4 first + 2 second slots in the slot table.
      return Math.ceil(enrollment.level / 2);
    case 'third':
      // Same round-up rule for third casters (Eldritch Knight, Arcane
      // Trickster). EK 4 -> ceil(4/3) = 2 -> 3 first-level slots.
      return enrollment.level >= 3 ? Math.ceil(enrollment.level / 3) : 0;
    case 'pact':
      return 0;
  }
};

export interface SpellSlotsResult {
  readonly slotsByLevel: ReadonlyArray<number>;
  readonly pactSlots?: { readonly level: number; readonly count: number };
}

export const computeSpellSlots = (
  character: Character,
  classesById: ReadonlyMap<string, Class>,
): SpellSlotsResult => {
  let multiclassCasterLevel = 0;
  let pactLevel = 0;
  let onlyOneFullOrHalfClass: ClassEnrollment | null = null;
  let multipleSpellcasters = false;

  for (const enrollment of character.classes) {
    const cls = classesById.get(enrollment.classId);
    const progression = cls?.spellcasting;
    if (!progression) continue;

    if (progression.type === 'pact') {
      pactLevel = Math.max(pactLevel, enrollment.level);
      continue;
    }

    multiclassCasterLevel += casterLevelContribution(enrollment, progression);
    if (onlyOneFullOrHalfClass === null) {
      onlyOneFullOrHalfClass = enrollment;
    } else {
      multipleSpellcasters = true;
    }
  }

  const slotsByLevel: number[] = new Array<number>(9).fill(0);

  if (multiclassCasterLevel > 0) {
    let effectiveLevel = multiclassCasterLevel;
    if (
      !multipleSpellcasters &&
      onlyOneFullOrHalfClass !== null
    ) {
      const cls = classesById.get(onlyOneFullOrHalfClass.classId);
      const progression = cls?.spellcasting;
      // 2024 third-casters (Eldritch Knight, Arcane Trickster) don't
      // pick up spellcasting until level 3. Below that the single-class
      // table is empty; above that the caster level is ceil(level/3).
      if (progression?.type === 'third' && onlyOneFullOrHalfClass.level < 3) {
        effectiveLevel = 0;
      }
      // NB: there is intentionally NO half-caster level-1 guard here. In SRD
      // 5.2.1 (2024) Paladins and Rangers gain the Spellcasting feature at
      // *Level 1* (the table grants 2 first-level slots) — the 2014 "starts
      // at level 2" rule was removed. See the `half-caster-l1-slot` row in
      // docs/l7-completion-audit.md (resolved NOT A BUG, slice 856) and the
      // slice-564 / slice-574 L1 spell-slot guards.
    }
    if (effectiveLevel > 0 && effectiveLevel <= FULL_CASTER_SLOTS.length) {
      const row = FULL_CASTER_SLOTS[effectiveLevel - 1];
      if (row !== undefined) {
        for (let i = 0; i < row.length && i < slotsByLevel.length; i++) {
          slotsByLevel[i] = row[i] ?? 0;
        }
      }
    }
  }

  const result: SpellSlotsResult = pactLevel > 0
    ? { slotsByLevel, pactSlots: PACT_SLOTS[pactLevel - 1] ?? { level: 1, count: 0 } }
    : { slotsByLevel };
  return result;
};

export const spellSlotsForLevel = (
  result: SpellSlotsResult,
  spellLevel: SpellLevel,
): number => {
  if (spellLevel === 0) return Number.POSITIVE_INFINITY;
  return result.slotsByLevel[spellLevel - 1] ?? 0;
};

export interface AvailableSlots {
  readonly standardByLevel: ReadonlyArray<number>;
  readonly pact: { readonly level: number; readonly count: number } | undefined;
}

export const computeAvailableSpellSlots = (
  character: Character,
  classesById: ReadonlyMap<string, Class>,
): AvailableSlots => {
  const max = computeSpellSlots(character, classesById);
  const standardByLevel = max.slotsByLevel.map((count, idx) => {
    const usedKey = String(idx + 1);
    const used = character.spellSlotsUsed[usedKey] ?? 0;
    return Math.max(0, count - used);
  });
  const pact = max.pactSlots
    ? {
        level: max.pactSlots.level,
        count: Math.max(0, max.pactSlots.count - character.pactSlotsUsed),
      }
    : undefined;
  return { standardByLevel, pact };
};
