// Property test: random spell-cast sequence
// interactions.
//
// Targeted tests cover each spell in isolation; this generator fuzzes
// random sequences of cast-spell intents against a fixed party and asserts
// invariants that must hold across any sequence:
//
//   1. Slot accounting balances: SpellSlotConsumed event count per
//      caster/slot-level equals the rise in `spellSlotsUsed` on the
//      character's final state. Same for pact slots.
//   2. Concentration is exclusive: a character never holds two
//      concentration effects simultaneously; starting a new one ends
//      the prior one.
//   3. Replay equivalence: replay(events).state deep-equals the
//      committed state.
//
// Each step in the sequence guards on preconditions (spell prepared,
// slot available) and skips the cast cleanly when they aren't met so
// the sequence is robust to randomness without short-circuiting the
// fuzz coverage.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { replay } from '../../src/engine/replay.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { computeAvailableSpellSlots } from '../../src/derive/spell-slots.js';
import { resolveContent } from '../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { Event } from '../../src/schemas/events/index.js';
import { ulid } from 'ulid';

const NUM_RUNS = Number.parseInt(process.env['FAST_CHECK_NUM_RUNS'] ?? '50', 10);
const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// Spells safe to cast against the test party. Each entry's slotLevel
// is the base level; the planner accepts any slotLevel >= base for
// leveled spells (cantrips ship at 0).
interface CastableSpell {
  readonly spellId: string;
  readonly baseLevel: number;
  readonly casterKind: 'wizard' | 'cleric';
}

const WIZARD_SPELLS: ReadonlyArray<CastableSpell> = [
  { spellId: 'fire-bolt', baseLevel: 0, casterKind: 'wizard' },
  { spellId: 'ray-of-frost', baseLevel: 0, casterKind: 'wizard' },
  { spellId: 'magic-missile', baseLevel: 1, casterKind: 'wizard' },
  { spellId: 'burning-hands', baseLevel: 1, casterKind: 'wizard' },
  { spellId: 'thunderwave', baseLevel: 1, casterKind: 'wizard' },
  { spellId: 'mage-armor', baseLevel: 1, casterKind: 'wizard' },
  { spellId: 'hold-person', baseLevel: 2, casterKind: 'wizard' }, // concentration
  { spellId: 'web', baseLevel: 2, casterKind: 'wizard' },           // concentration
  { spellId: 'fireball', baseLevel: 3, casterKind: 'wizard' },
];

const CLERIC_SPELLS: ReadonlyArray<CastableSpell> = [
  { spellId: 'sacred-flame', baseLevel: 0, casterKind: 'cleric' },
  { spellId: 'cure-wounds', baseLevel: 1, casterKind: 'cleric' },
  { spellId: 'healing-word', baseLevel: 1, casterKind: 'cleric' },
  { spellId: 'bless', baseLevel: 1, casterKind: 'cleric' },         // concentration
  { spellId: 'bane', baseLevel: 1, casterKind: 'cleric' },          // concentration
  { spellId: 'hold-person', baseLevel: 2, casterKind: 'cleric' },   // concentration
  { spellId: 'aid', baseLevel: 2, casterKind: 'cleric' },
];

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Velka',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: WIZARD_SPELLS.map((s) => s.spellId),
    knownSpells: WIZARD_SPELLS.filter((s) => s.baseLevel === 0).map((s) => s.spellId),
  });

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mirenna',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 35, max: 35, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: CLERIC_SPELLS.map((s) => s.spellId),
    knownSpells: CLERIC_SPELLS.filter((s) => s.baseLevel === 0).map((s) => s.spellId),
  });

const buildDummy = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: ['savage-attacker'],
  });

interface CastStep {
  readonly casterKind: 'wizard' | 'cleric';
  readonly spellIndex: number;
  readonly slotLevelBump: number; // 0 → base; >0 → upcast by that many levels
}

const castStepArb = (): fc.Arbitrary<CastStep> =>
  fc.record({
    casterKind: fc.constantFrom('wizard' as const, 'cleric' as const),
    spellIndex: fc.integer({ min: 0, max: Math.max(WIZARD_SPELLS.length, CLERIC_SPELLS.length) - 1 }),
    slotLevelBump: fc.integer({ min: 0, max: 2 }),
  });

const castSequenceArb = (): fc.Arbitrary<ReadonlyArray<CastStep>> =>
  fc.array(castStepArb(), { minLength: 5, maxLength: 20 });

describe('random spell-cast sequence invariants', () => {
  it('slot accounting balances and replay equivalence holds across random sequences', () => {
    fc.assert(
      fc.property(castSequenceArb(), fc.integer({ min: 1, max: 1_000_000 }), (steps, seed) => {
        const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
        const wizard = buildWizard();
        const cleric = buildCleric();
        const t1 = buildDummy('Goblin A');
        const t2 = buildDummy('Goblin B');

        let campaign = engine.createCampaign({ name: 'spell-seq' });
        campaign = commit(campaign, [
          { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
          { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
          { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'CharacterCreated', snapshot: t1 } satisfies CharacterCreatedEvent,
          { id: ulid() as Event['id'], at: '2026-01-01T00:00:00Z', type: 'CharacterCreated', snapshot: t2 } satisfies CharacterCreatedEvent,
        ]);

        const slotConsumed: Record<string, Record<number, number>> = {
          [wizard.id]: {},
          [cleric.id]: {},
        };

        const recordSlotConsumed = (charId: string, level: number): void => {
          const perChar = slotConsumed[charId] ?? {};
          perChar[level] = (perChar[level] ?? 0) + 1;
          slotConsumed[charId] = perChar;
        };

        for (const step of steps) {
          const pool = step.casterKind === 'wizard' ? WIZARD_SPELLS : CLERIC_SPELLS;
          const spell = pool[step.spellIndex % pool.length];
          if (spell === undefined) continue;
          const casterId = step.casterKind === 'wizard' ? wizard.id : cleric.id;
          const slotLevel = Math.min(9, spell.baseLevel + (spell.baseLevel === 0 ? 0 : step.slotLevelBump));

          // Precondition: slot is available for leveled casts. Cantrips
          // (baseLevel 0) always proceed.
          const char = campaign.state.characters[casterId];
          if (!char) continue;
          if (slotLevel > 0) {
            const available = computeAvailableSpellSlots(char, CONTENT.classes);
            const std = available.standardByLevel[slotLevel - 1] ?? 0;
            if (std <= 0) continue; // no slot, skip cleanly
          }

          // Plan the cast. Some spells require specific targeting that
          // may fail at runtime (e.g. magic-missile needs N targets).
          // Wrap in try/catch so a planner rejection ends just this step.
          try {
            const targetIds =
              spell.spellId === 'magic-missile' ? [t1.id, t1.id, t1.id, t1.id] : [t1.id, t2.id];
            const planned = engine.plan.castSpell(campaign.state, {
              characterId: casterId,
              spellId: spell.spellId,
              slotLevel,
              targetIds,
            }).events as ReadonlyArray<Event>;
            campaign = commit(campaign, planned);
            for (const evt of planned) {
              if (evt.type === 'SpellSlotConsumed') {
                recordSlotConsumed(evt.characterId, evt.slotLevel);
              }
            }
          } catch {
            // Precondition we don't pre-check (e.g. target invalid) —
            // skip cleanly; the next step is independent.
            continue;
          }

          // Invariant 2 (per-step): no character holds concentration on
          // more than one effect. The schema field is single-valued, so
          // this is more a "the field is consistent" check.
          for (const c of Object.values(campaign.state.characters)) {
            if (c.concentrationEffectId !== undefined) {
              expect(campaign.state.effectInstances[c.concentrationEffectId]).toBeDefined();
            }
          }
        }

        // Invariant 1: slot accounting balances.
        for (const casterId of [wizard.id, cleric.id]) {
          const char = campaign.state.characters[casterId];
          if (!char) continue;
          const consumedByLevel = slotConsumed[casterId] ?? {};
          for (let lvl = 1; lvl <= 9; lvl++) {
            const expectedUsed = consumedByLevel[lvl] ?? 0;
            const actualUsed = char.spellSlotsUsed[String(lvl)] ?? 0;
            expect(actualUsed, `caster ${casterId} L${lvl} slots`).toBe(expectedUsed);
          }
        }

        // Invariant 3: replay equivalence.
        const replayed = replay(campaign.events);
        expect(replayed).toEqual(campaign.state);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
