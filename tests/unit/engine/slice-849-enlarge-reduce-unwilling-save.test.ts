// Slice 849 — `enlarge-reduce-no-damage-rider-or-save` (the "or-save" arm).
//
// RAW (SRD 5.2.1 Enlarge/Reduce): "If the target is an unwilling creature,
// it can make a Constitution saving throw. On a successful save, the spell
// has no effect." The engine modeled Enlarge/Reduce as a pure buff that
// auto-applied to any target with no save — so an enemy could be Reduced
// (Disadvantage on STR checks/saves) against its will, no roll. This slice
// adds a generic save-gated-buff primitive: the buff SpellMechanic carries
// `unwillingSave: { ability }`, the consumer names the unwilling targets via
// `intent.unwillingTargetIds` (the engine doesn't model willingness — it's a
// creature-relationship fact the consumer owns, like cover / lightLevel),
// and each named target rolls that save vs the caster's spell save DC. On a
// success the buff has no effect on it; on a failure (or for a willing
// target) it lands as before.
//
// The ±1d4 weapon-damage rider (enlarge adds 1d4, reduce subtracts 1d4 with a
// min-1 floor) is the OTHER arm of the original audit row and is split off as
// a tracked follow-up (`enlarge-reduce-no-damage-rider`) — it needs a
// negative-damage rider primitive the damage pipeline doesn't have yet.
//
// This guard pins: (a) the spell carries the CON unwillingSave; (b) a willing
// target takes the buff with NO save rolled (byte-identical to the old
// behavior); (c) an unwilling target that FAILS the save is Enlarged/Reduced;
// (d) an unwilling target that SUCCEEDS resists entirely (no condition).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const enlargeReduce = () => PACK.spells.find((s) => s.id === 'enlarge-reduce')!;

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mordin',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    preparedSpells: ['enlarge-reduce'],
  });

// A plain Fighter (no CON-save proficiency). CON drives whether it beats the
// wizard's DC 15 on the seed-1 save d20 (a 10): CON 4 (−3) → 7, fails;
// CON 20 (+5) → 15, succeeds.
const buildTarget = (con: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `Brute-${con}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: con, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 25, max: 25, temp: 0 },
  });

const seedCampaign = (wizard: Character, target: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'enlarge-guard' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 849: Enlarge/Reduce unwilling-target CON save', () => {
  it('the spell carries a CON unwillingSave on its buff mechanic', () => {
    const buff = enlargeReduce().mechanicalEffects.find((m) => m.kind === 'buff');
    expect(buff, 'Enlarge/Reduce ships a buff mechanic').toBeDefined();
    expect((buff as { unwillingSave?: { ability?: string } }).unwillingSave?.ability).toBe('CON');
  });

  it('a willing target is Enlarged with NO save rolled (byte-identical to the old buff)', () => {
    const wizard = buildWizard();
    const target = buildTarget(20);
    const { engine, campaign } = seedCampaign(wizard, target);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'enlarge-reduce',
      slotLevel: 2,
      targetIds: [target.id],
      // No unwillingTargetIds → the target is willing → no save.
      casterChoice: { kind: 'variant', value: 'enlarge' },
    });
    expect(res.events.some((e) => e.type === 'SaveRolled')).toBe(false);
    const applied = res.events.find(
      (e) => e.type === 'ConditionApplied' && e.conditionId === 'enlarged-active',
    );
    expect(applied).toBeDefined();
  });

  it('an unwilling target that FAILS the CON save is Enlarged', () => {
    const wizard = buildWizard();
    const target = buildTarget(4); // −3 → 7 vs DC 15 on the seed-1 d20 (10): fail
    const { engine, campaign } = seedCampaign(wizard, target);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'enlarge-reduce',
      slotLevel: 2,
      targetIds: [target.id],
      unwillingTargetIds: [target.id],
      casterChoice: { kind: 'variant', value: 'enlarge' },
    });
    const save = res.events.find((e) => e.type === 'SaveRolled');
    expect(save).toBeDefined();
    expect((save as { ability: string }).ability).toBe('CON');
    expect((save as { success: boolean }).success).toBe(false);
    expect(
      res.events.some((e) => e.type === 'ConditionApplied' && e.conditionId === 'enlarged-active'),
    ).toBe(true);
  });

  it('an unwilling target that SUCCEEDS on the CON save resists entirely (no condition)', () => {
    const wizard = buildWizard();
    const target = buildTarget(20); // +5 → 15 vs DC 15 on the seed-1 d20 (10): success
    const { engine, campaign } = seedCampaign(wizard, target);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'enlarge-reduce',
      slotLevel: 2,
      targetIds: [target.id],
      unwillingTargetIds: [target.id],
      casterChoice: { kind: 'variant', value: 'enlarge' },
    });
    const save = res.events.find((e) => e.type === 'SaveRolled');
    expect(save).toBeDefined();
    expect((save as { success: boolean }).success).toBe(true);
    expect(res.events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });

  it('the Reduce variant is gated by the same unwilling save', () => {
    const wizard = buildWizard();
    const target = buildTarget(4); // fails on the seed-1 d20
    const { engine, campaign } = seedCampaign(wizard, target);
    const res = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'enlarge-reduce',
      slotLevel: 2,
      targetIds: [target.id],
      unwillingTargetIds: [target.id],
      casterChoice: { kind: 'variant', value: 'reduce' },
    });
    expect(res.events.some((e) => e.type === 'SaveRolled')).toBe(true);
    expect(
      res.events.some((e) => e.type === 'ConditionApplied' && e.conditionId === 'reduced-active'),
    ).toBe(true);
  });
});
