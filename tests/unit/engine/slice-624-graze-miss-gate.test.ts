// Slice 624: Graze mastery fires only on a MISS (RAW 2024 PHB
// equipment.md: "If your attack roll with this weapon misses a
// creature, you can deal damage to that creature equal to the
// ability modifier you used to make the attack roll").
//
// Pre-slice the engine's planWeaponMastery dealt graze damage
// unconditionally; the fuzz dispatch fired ALL masteries on hit,
// including Graze. The slice-622 L1 fuzz at seed 6009 surfaced this:
// Aria with a glaive HIT Bran for 7 slashing AND then "Mastery: Graze"
// applied an additional 2 damage. RAW: zero Graze damage on a hit.
//
// Fix: WeaponMasteryIntent gained an optional `attackHit` field. The
// planner invariant-checks the RAW shape per mastery (Graze: must be
// false; Sap/Vex/Slow/Topple/Push/Cleave: must be true). The fuzz
// dispatch (scripts/combat-fuzz-core.ts) now gates Graze on miss and
// other masteries on hit.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { WeaponMasteryActivatedEvent } from '../../../src/schemas/events/weapon-mastery.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildBarb = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 14, max: 14, temp: 0 },
    weaponMasteries: ['glaive'],
  });
const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const setup = (): { engine: ReturnType<typeof createEngine>; aria: Character; borc: Character; glaive: ReturnType<typeof makeItemInstance>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const aria = buildBarb('Aria');
  const borc = buildTarget('Borc');
  const glaive = makeItemInstance('glaive');
  let campaign: Campaign = engine.createCampaign({ name: 'slice-624' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: glaive },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aria } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
  ]);
  return { engine, aria, borc, glaive, campaign };
};

describe('slice 624: Graze mastery RAW hit/miss gate', () => {
  it('Graze fires with attackHit=false and emits a DamageApplied for the ability mod', () => {
    const { engine, aria, borc, glaive, campaign } = setup();
    const result = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Graze',
      attackerId: aria.id,
      targetId: borc.id,
      weaponInstanceId: glaive.id,
      attackHit: false,
    });
    const activations = result.events.filter(
      (e): e is WeaponMasteryActivatedEvent => e.type === 'WeaponMasteryActivated',
    );
    expect(activations.length, 'Graze emits WeaponMasteryActivated when attack missed').toBe(1);
    expect(activations[0]!.mastery).toBe('Graze');
    const damage = result.events.find(
      (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === borc.id,
    );
    expect(damage, 'Graze deals damage on miss').toBeDefined();
    // Aria STR 16 = +3 mod. Glaive damage type = slashing.
    expect(damage!.components[0]?.amount).toBe(3);
    expect(damage!.components[0]?.type).toBe('slashing');
  });

  it('Graze throws when called with attackHit=true (RAW miss-only gate)', () => {
    const { engine, aria, borc, glaive, campaign } = setup();
    expect(() =>
      engine.plan.weaponMastery(campaign.state, {
        mastery: 'Graze',
        attackerId: aria.id,
        targetId: borc.id,
        weaponInstanceId: glaive.id,
        attackHit: true,
      }),
    ).toThrow(/Graze fires only when the attack misses/);
  });

  it('on-hit masteries (Sap) throw when called with attackHit=false', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const aria = {
      ...buildBarb('Aria'),
      weaponMasteries: ['longsword'],
    };
    const borc = buildTarget('Borc');
    const sword = makeItemInstance('longsword');
    let campaign: Campaign = engine.createCampaign({ name: 'slice-624-sap' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aria } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.weaponMastery(campaign.state, {
        mastery: 'Sap',
        attackerId: aria.id,
        targetId: borc.id,
        weaponInstanceId: sword.id,
        attackHit: false,
      }),
    ).toThrow(/Sap fires only on a hit/);
  });

  it('legacy callers (no attackHit) still work (backwards compatibility)', () => {
    // The s23-weapon-mastery.test.ts golden test doesn't pass attackHit;
    // it should keep working for non-Graze masteries the same way it
    // did pre-slice. Validate by firing Sap without attackHit.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const aria = {
      ...buildBarb('Aria'),
      weaponMasteries: ['longsword'],
    };
    const borc = buildTarget('Borc');
    const sword = makeItemInstance('longsword');
    let campaign: Campaign = engine.createCampaign({ name: 'slice-624-legacy' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aria } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    const result = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Sap',
      attackerId: aria.id,
      targetId: borc.id,
      weaponInstanceId: sword.id,
    });
    expect(result.events.some((e) => e.type === 'WeaponMasteryActivated')).toBe(true);
  });
});
