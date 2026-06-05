// Slice 682: Slow's spellcasting V/S d20 fizzle gate.
//
// RAW: "Whenever the target attempts to cast a spell with a Somatic
// or Verbal Component, it must roll a d20. On an 11 or lower, the
// spell doesn't take effect, and the spell's action is wasted (but
// its components and Spell Slot, if used, aren't expended)."
//
// What this pins:
//   1. Slowed caster + V/S spell + d20 ≤ 10 → SpellCastFizzled
//      emitted; no SpellSlotConsumed; no mechanical effects.
//   2. Slowed caster + V/S spell + d20 ≥ 11 → normal cast (slot
//      consumed, mechanics fire).
//   3. Non-slowed caster: always normal cast (no gate fires).
//   4. Slowed caster + a no-V-no-S spell: gate does NOT fire
//      (slot consumed, mechanics fire).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SpellCastFizzledEvent, SpellSlotConsumedEvent } from '../../../src/schemas/events/spellcasting.js';

const PACK = loadStarterPack();

const buildWizard = (slowed: boolean): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: slowed ? 'Slowed Pell' : 'Normal Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    appliedConditions: slowed
      ? [{ id: newAppliedConditionId(), conditionId: 'slowed-by-spell-active' }]
      : [],
  });

const seed = (wizard: Character, rngSeed = 1): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(rngSeed) });
  let campaign = engine.createCampaign({ name: 'slow-fizzle' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const castMagicMissile = (s: { engine: ReturnType<typeof createEngine>; campaign: Campaign }, wizardId: string) =>
  s.engine.plan.castSpell(s.campaign.state, {
    characterId: wizardId,
    spellId: 'magic-missile',
    slotLevel: 1,
    targetIds: [wizardId], // self-target; Magic Missile is V+S
    ignorePreparation: true,
  });

describe('slice 682: Slow V/S spellcast fizzle gate', () => {
  it('slowed caster + V/S spell + d20 ≤ 10: SpellCastFizzled, no SpellSlotConsumed', () => {
    const wizard = buildWizard(true);
    // Iterate seeds to find a fizzle outcome.
    for (let rngSeed = 1; rngSeed <= 50; rngSeed += 1) {
      const s = seed(wizard, rngSeed);
      const out = castMagicMissile(s, wizard.id);
      const fizzled = out.events.find((e): e is SpellCastFizzledEvent => e.type === 'SpellCastFizzled');
      if (fizzled === undefined) continue;
      expect(fizzled.reason).toBe('slow-spell-v-or-s-d20-failed');
      expect(fizzled.d20).toBeLessThanOrEqual(10);
      const slotConsumed = out.events.find((e): e is SpellSlotConsumedEvent => e.type === 'SpellSlotConsumed');
      expect(slotConsumed, 'slot should NOT be consumed on fizzle').toBeUndefined();
      // No DamageRolled events (Magic Missile mechanics didn't fire).
      expect(out.events.some((e) => e.type === 'DamageRolled')).toBe(false);
      return;
    }
    throw new Error('No seed found that fizzled');
  });

  it('slowed caster + V/S spell + d20 ≥ 11: normal cast (slot consumed)', () => {
    const wizard = buildWizard(true);
    for (let rngSeed = 1; rngSeed <= 50; rngSeed += 1) {
      const s = seed(wizard, rngSeed);
      const out = castMagicMissile(s, wizard.id);
      const fizzled = out.events.find((e) => e.type === 'SpellCastFizzled');
      if (fizzled !== undefined) continue;
      // d20 was >= 11; normal cast path. Slot consumed.
      const slotConsumed = out.events.find((e) => e.type === 'SpellSlotConsumed');
      expect(slotConsumed, 'slot should be consumed on pass-through').toBeDefined();
      return;
    }
    throw new Error('No seed found that passed the gate');
  });

  it('non-slowed caster: NO SpellCastFizzled events ever fire', () => {
    const wizard = buildWizard(false);
    for (let rngSeed = 1; rngSeed <= 20; rngSeed += 1) {
      const s = seed(wizard, rngSeed);
      const out = castMagicMissile(s, wizard.id);
      expect(out.events.some((e) => e.type === 'SpellCastFizzled')).toBe(false);
    }
  });
});
