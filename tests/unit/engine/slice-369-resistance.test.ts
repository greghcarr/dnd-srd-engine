// Slice 369 - Resistance cantrip: the 1d4 damage reduction is now wired.
//
// Bug (logged in the slice-361 sweep): the `resisted` condition had no
// consume path (Resistance did nothing) and its description was the 2014
// "add 1d4 to a save" wording. SRD 5.2.1 Resistance is: choose a damage
// type at cast; when the creature takes that damage type, reduce the
// total by 1d4, once per turn. Fix: planConsumeResistance, mirroring
// Absorb Elements - the consumer calls it when the resisted creature
// takes the chosen damage type; it rolls 1d4 and emits a compensating
// Healed for min(1d4, damageAmount). Once-per-turn + the chosen type are
// consumer-coordinated (documented).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, HealedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildTarget = (hpCurrent = 20): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Warded',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: hpCurrent, max: 30, temp: 0 },
  });

// Seeds a campaign with a creature carrying the `resisted` marker.
const withResistance = () => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'resist' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: target.id,
      conditionId: 'resisted',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent,
  ]);
  return { engine, campaign, targetId: target.id };
};

describe('slice 369: Resistance cantrip 1d4 reduction', () => {
  it('rolls 1d4 and emits a compensating Healed for the reduction', () => {
    const { engine, campaign, targetId } = withResistance();
    const out = engine.plan.consumeResistance(campaign.state, {
      targetId,
      damageType: 'fire',
      damageAmount: 10,
    });
    expect(out.d4).toBeGreaterThanOrEqual(1);
    expect(out.d4).toBeLessThanOrEqual(4);
    expect(out.reduction).toBe(out.d4); // 10 damage > any d4, so full d4 applies
    const healed = out.events.find((e): e is HealedEvent => e.type === 'Healed');
    expect(healed?.amount).toBe(out.reduction);
    expect(healed?.targetId).toBe(targetId);
    expect(healed?.source).toBe('resistance');
  });

  it('caps the reduction at the damage taken (no net healing on a tiny hit)', () => {
    const { engine, campaign, targetId } = withResistance();
    const out = engine.plan.consumeResistance(campaign.state, {
      targetId,
      damageType: 'cold',
      damageAmount: 1,
    });
    expect(out.reduction).toBe(1); // min(d4, 1)
    expect(out.reduction).toBeLessThanOrEqual(1);
  });

  it('rejects a creature without Resistance active, a non-Resistance damage type, and negative damage', () => {
    const { engine, campaign, targetId } = withResistance();
    const noResist = buildTarget();
    const seeded = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: noResist } satisfies CharacterCreatedEvent,
    ]);
    expect(() => engine.plan.consumeResistance(seeded.state, { targetId: noResist.id, damageType: 'fire', damageAmount: 5 })).toThrow(/resisted/);
    // Force and Psychic are excluded from Resistance's type list.
    expect(() => engine.plan.consumeResistance(campaign.state, { targetId, damageType: 'force', damageAmount: 5 })).toThrow(/not in allowed list/);
    expect(() => engine.plan.consumeResistance(campaign.state, { targetId, damageType: 'fire', damageAmount: -1 })).toThrow(/non-negative/);
  });
});
