// Slice 888 — the Burning environmental Hazard. Part of closing the L7 audit
// Area-8 quirk `no-environmental-hazards` (the combat-relevant hazard; the
// per-day downtime hazards stay consumer-cadenced — see the audit row).
//
// RAW (rules-glossary "Burning" [Hazard]): "A burning creature or object takes
// 1d4 Fire damage at the start of each of its turns. As an action, you can
// extinguish fire on yourself by giving yourself the Prone condition and
// rolling on the ground. The fire also goes out if it is doused, submerged, or
// suffocated."
//
// Engine scope: a generic `burning` condition carrying recurringDamage{1d4
// fire, turnStart}. The consumer applies it when something catches fire and
// ticks engine.plan.tickRecurringDamage at the bearer's turn-start; there is
// NO autoExpiry — the consumer removes the condition when the fire is put out
// (the Prone-and-roll / doused / submerged action is narrative).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Kindling', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 }, featsTaken: [],
  });

const setup = () => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
  const victim = buildVictim();
  let campaign: Campaign = engine.createCampaign({ name: 'burning' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId: victim.id as never,
      conditionId: 'burning', appliedConditionId: newAppliedConditionId() } satisfies ConditionAppliedEvent,
  ]);
  return { engine, campaign, id: victim.id };
};

describe('Burning hazard (slice 888)', () => {
  it('the burning condition carries recurringDamage{1d4 fire, turnStart} and no autoExpiry', () => {
    const cond = PACK.conditions?.find((c) => c.id === 'burning');
    expect(cond).toBeDefined();
    expect(cond!.recurringDamage).toEqual({ dice: '1d4', damageType: 'fire', trigger: 'turnStart' });
    expect(cond!.autoExpiry).toBeUndefined();
    expect(cond!.effects).toEqual([]);
  });

  it('a tick deals 1d4 Fire damage to the burning creature', () => {
    const { engine, campaign, id } = setup();
    const events = engine.plan.tickRecurringDamage(campaign.state, { targetId: id, conditionId: 'burning' }).events;
    const dmg = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    expect(dmg).toBeDefined();
    const total = dmg!.components.reduce((sum, c) => sum + c.amount, 0);
    expect(dmg!.components.every((c) => c.type === 'fire')).toBe(true);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(4);
  });

  it('persists across ticks (no autoExpiry) until the consumer removes it', () => {
    let { engine, campaign, id } = setup();
    // Two consecutive turn-start ticks both deal fire damage — the condition
    // is still present after the first (it does not self-expire).
    campaign = commit(campaign, engine.plan.tickRecurringDamage(campaign.state, { targetId: id, conditionId: 'burning' }).events);
    const stillBurning = campaign.state.characters[id]!.appliedConditions.some((c) => c.conditionId === 'burning');
    expect(stillBurning).toBe(true);
    const second = engine.plan.tickRecurringDamage(campaign.state, { targetId: id, conditionId: 'burning' }).events;
    expect(second.some((e) => e.type === 'DamageApplied')).toBe(true);
  });
});
