// Slice 626: on-hit weapon masteries (Sap, Vex, Slow, Topple, Push)
// gate on "and deal damage to the creature" (RAW), not just on hit.
// A hit reduced to 0 by resistance/immunity shouldn't fire the rider.
// Cleave doesn't have this gate (just requires the hit). Graze deals
// the damage itself.
//
// This is the slice-624 open follow-up: slice 624 gated Graze on miss
// and on-hit masteries on hit, but didn't tighten the on-hit gate
// further to also require damage > 0. Slice 626 closes that.
//
// Pre-slice: a Sap weapon hit reduced to 0 damage by resistance still
// applied the Sapped condition. Post-slice: caller signals
// `attackDealtDamage: false` and the planner emits only the
// activation event (no Sapped condition).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighterWithSap = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Aria', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    weaponMasteries: ['longsword'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Borc', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const setup = (): { engine: ReturnType<typeof createEngine>; aria: Character; borc: Character; sword: ReturnType<typeof makeItemInstance>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const aria = buildFighterWithSap();
  const borc = buildTarget();
  const sword = makeItemInstance('longsword');
  let campaign: Campaign = engine.createCampaign({ name: 'slice-626' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aria } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
  ]);
  return { engine, aria, borc, sword, campaign };
};

describe('slice 626: on-hit masteries skip rider when no damage was dealt', () => {
  it('Sap with attackDealtDamage=false emits only the activation event (no sapped condition)', () => {
    const { engine, aria, borc, sword, campaign } = setup();
    const result = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Sap',
      attackerId: aria.id,
      targetId: borc.id,
      weaponInstanceId: sword.id,
      attackHit: true,
      attackDealtDamage: false,
    });
    expect(result.events.length, 'expected just the activation event, no rider').toBe(1);
    expect(result.events[0]!.type).toBe('WeaponMasteryActivated');
    expect(result.events.some((e) => e.type === 'ConditionApplied'), 'Sapped condition must NOT apply when no damage dealt').toBe(false);
  });

  it('Sap with attackDealtDamage=true (default-effective: any damage) applies the sapped condition', () => {
    const { engine, aria, borc, sword, campaign } = setup();
    const result = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Sap',
      attackerId: aria.id,
      targetId: borc.id,
      weaponInstanceId: sword.id,
      attackHit: true,
      attackDealtDamage: true,
    });
    expect(result.events.some((e) => e.type === 'ConditionApplied' && (e as { conditionId: string }).conditionId === 'sapped')).toBe(true);
  });

  it('Sap without the field (legacy caller) still applies the condition (backwards compat)', () => {
    const { engine, aria, borc, sword, campaign } = setup();
    const result = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Sap',
      attackerId: aria.id,
      targetId: borc.id,
      weaponInstanceId: sword.id,
      // No attackHit, no attackDealtDamage -- legacy.
    });
    expect(result.events.some((e) => e.type === 'ConditionApplied' && (e as { conditionId: string }).conditionId === 'sapped')).toBe(true);
  });

  it('Cleave with attackDealtDamage=false still fires (RAW: Cleave does NOT require damage)', () => {
    // Cleave's RAW is "If you hit a creature with a melee attack roll
    // using this weapon, you can make a melee attack roll with the
    // weapon against a second creature..." -- no damage gate.
    // The planner's Cleave branch is a no-op in this file (lives in
    // attack planner) but the gate at the top of planWeaponMastery
    // shouldn't refuse the call.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const aria = {
      ...buildFighterWithSap(),
      weaponMasteries: ['greataxe'],
    };
    const borc = buildTarget();
    const greataxe = makeItemInstance('greataxe');
    let campaign: Campaign = engine.createCampaign({ name: 'slice-626-cleave' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: greataxe },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aria } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    // Should NOT throw and SHOULD still emit the activation event.
    const result = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Cleave',
      attackerId: aria.id,
      targetId: borc.id,
      weaponInstanceId: greataxe.id,
      attackHit: true,
      attackDealtDamage: false,
    });
    expect(result.events.some((e) => e.type === 'WeaponMasteryActivated')).toBe(true);
  });
});
