// Slice 501: Shillelagh (2024 Druid cantrip) - the weapon-buff mechanic.
// Closes the Shillelagh slot from the L1 schema-only audit.
//
// RAW (SRD 5.2.1 Shillelagh, Transmutation cantrip, Druid):
// "A Club or Quarterstaff you are holding is imbued with nature's power.
// For the duration, you can use your spellcasting ability instead of
// Strength for the attack and damage rolls of melee attacks using that
// weapon, and the weapon's damage die becomes a d8. If the attack deals
// damage, it can be Force damage or the weapon's normal damage type
// (your choice)." 1 minute, NOT concentration.
//
// Engine additions:
//   - `abilityOverride` / `damageDieOverride` / `damageTypeOverride` on
//     ItemTemporaryBuff (+ ItemBuffApplied event + reducer). The attack
//     resolver + attack-bonus derive read them when the weapon is used.
//   - `sourceEffectInstanceId` on ItemTemporaryBuff made optional, since
//     Shillelagh is a non-concentration, consumer-expiry buff.
//   - New SpellMechanic `kind: 'weapon-buff'` (useSpellcastingAbility /
//     damageDieOverride / damageTypeChoice) + `planWeaponBuffMechanic`.
//
// Documented RAW deviation: Shillelagh's damage-type choice is per-hit;
// the engine collapses it to a single cast-time choice (intent.casterChoice).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemBuffAppliedEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildDruid = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Druid',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['shillelagh'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Shillelagh (slice 501)', () => {
  it('shillelagh ships with a weapon-buff mechanic', () => {
    const s = PACK.spells.find((sp) => sp.id === 'shillelagh');
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'weapon-buff', useSpellcastingAbility: true, damageDieOverride: '1d8', damageTypeChoice: { allowed: ['force'] } },
    ]);
  });

  it('casting Shillelagh stamps an ItemBuffApplied with the WIS override, d8 die, and chosen Force type', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const druid = buildDruid(1);
    const club = makeItemInstance('club');
    let campaign: Campaign = engine.createCampaign({ name: 'shillelagh' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: druid.id,
      spellId: 'shillelagh',
      slotLevel: 0,
      targetIds: [druid.id],
      weaponInstanceId: club.id,
      casterChoice: { kind: 'damageType', value: 'force' },
    }).events;
    const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
    expect(buff).toBeDefined();
    expect(buff).toMatchObject({
      instanceId: club.id,
      attackBonus: 0,
      damageBonus: 0,
      abilityOverride: 'WIS',
      damageDieOverride: '1d8',
      damageTypeOverride: 'force',
      source: 'Shillelagh',
    });
    // Non-concentration: no link to a concentration effect.
    expect(buff?.sourceEffectInstanceId).toBeUndefined();
  });

  it('a club imbued by Shillelagh attacks with the WIS mod (not STR)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const druid = buildDruid(1);
    const target = buildTarget();
    const club = makeItemInstance('club');
    let campaign: Campaign = engine.createCampaign({ name: 'shillelagh-attack' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: druid.id,
      spellId: 'shillelagh',
      slotLevel: 0,
      targetIds: [druid.id],
      weaponInstanceId: club.id,
      casterChoice: { kind: 'damageType', value: 'force' },
    }).events;
    campaign = commit(campaign, cast);
    const events = engine.plan.attack(campaign.state, {
      attackerId: druid.id,
      targetId: target.id,
      weaponInstanceId: club.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
    expect(attack).toBeDefined();
    // Druid L1: WIS 18 (+4), proficient with simple weapons (+2 PB).
    // Without Shillelagh the club uses STR 8 (-1), so attackBonus would
    // be +1. With the buff: +4 +2 = +6. The +5 delta proves the override.
    expect(attack?.attackBonus).toBe(6);
  });

  it('damage on hit uses the d8 die, WIS mod, and Force type', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid(1);
      const target = buildTarget();
      const club = makeItemInstance('club');
      let campaign: Campaign = engine.createCampaign({ name: `shillelagh-dmg-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'shillelagh',
        slotLevel: 0,
        targetIds: [druid.id],
        weaponInstanceId: club.id,
        casterChoice: { kind: 'damageType', value: 'force' },
      }).events;
      campaign = commit(campaign, cast);
      const events = engine.plan.attack(campaign.state, {
        attackerId: druid.id,
        targetId: target.id,
        weaponInstanceId: club.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const dmg = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(dmg).toBeDefined();
      // Club is normally 1d4 bludgeoning; Shillelagh makes it 1d8 and
      // (chosen) Force, with the WIS mod (+4) as the damage modifier.
      expect(dmg!.rolls[0]!.expression).toBe('1d8');
      expect(dmg!.rolls[0]!.modifier).toBe(4);
      expect(dmg!.rolls[0]!.type).toBe('force');
      return;
    }
    throw new Error('No hit across 40 seeds');
  });

  it('without a damage-type choice the imbued weapon keeps its normal type', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const druid = buildDruid(1);
      const target = buildTarget();
      const club = makeItemInstance('club');
      let campaign: Campaign = engine.createCampaign({ name: `shillelagh-normal-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'shillelagh',
        slotLevel: 0,
        targetIds: [druid.id],
        weaponInstanceId: club.id,
      }).events;
      const buff = cast.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
      expect(buff?.damageTypeOverride).toBeUndefined();
      campaign = commit(campaign, cast);
      const events = engine.plan.attack(campaign.state, {
        attackerId: druid.id,
        targetId: target.id,
        weaponInstanceId: club.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const dmg = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      // d8 die still applies (the buff overrides it); type stays the
      // club's normal bludgeoning since no Force choice was made.
      expect(dmg!.rolls[0]!.expression).toBe('1d8');
      expect(dmg!.rolls[0]!.type).toBe('bludgeoning');
      return;
    }
    throw new Error('No hit across 40 seeds');
  });

  it('a Shillelagh cast without weaponInstanceId throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const druid = buildDruid(1);
    let campaign: Campaign = engine.createCampaign({ name: 'no-weapon' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'shillelagh',
        slotLevel: 0,
        targetIds: [druid.id],
      }),
    ).toThrow(/weapon-buff mechanic and requires intent.weaponInstanceId/i);
  });

  it('a Shillelagh cast targeting a non-weapon instance throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const druid = buildDruid(1);
    const potion = makeItemInstance('healing-potion');
    let campaign: Campaign = engine.createCampaign({ name: 'non-weapon' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: druid.id,
        spellId: 'shillelagh',
        slotLevel: 0,
        targetIds: [druid.id],
        weaponInstanceId: potion.id,
      }),
    ).toThrow(/is not a weapon/i);
  });
});
