import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemBuffAppliedEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

// Tests Elemental Weapon's item-buff path. The dedicated planner
// (engine.plan.elementalWeapon) stamps an ItemBuffApplied carrying
// attackBonus + extraDamageDice + extraDamageType; the attack planner
// rolls the extra dice on hit and adds them as a second damage
// component of the chosen type. Slot 3-4: +1/1d4, slot 5-6: +2/2d4,
// slot 7+: +3/3d4 per RAW. Crits double the extra dice.

const PACK = loadStarterPack();

// Use a wizard for full-caster slot access — the spell's class list
// (paladin / druid) isn't engine-enforced, so wizard works fine for
// exercising slot tiers up to 7+. A real paladin (half-caster) caps
// at slot 5 at L17+ and never gets slot 7.
const buildCaster = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Elementalist',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 12, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    featsTaken: [],
    preparedSpells: ['elemental-weapon'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

// L19 wizard exercises every slot tier (1-9) in the same fixture.
// Elemental Weapon's RAW tiers are slot 3 (+1/1d4), slot 5 (+2/2d4),
// slot 7 (+3/3d4) — testing requires slots 3, 5, 7, 9.
const buildCampaign = (casterLevel: number) => {
  const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(0) });
  const longsword = makeItemInstance('longsword');
  const caster = buildCaster(casterLevel);
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'elemental-weapon' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, longsword, caster, target };
};

describe('engine.plan.elementalWeapon', () => {
  it("stamps the weapon with +1 attack + 1d4 fire at slot 3", () => {
    const { engine, campaign, longsword, caster } = buildCampaign(19);
    const events = engine.plan.elementalWeapon(campaign.state, {
      casterId: caster.id,
      weaponInstanceId: longsword.id,
      slotLevel: 3,
      damageType: 'fire',
    }).events;
    const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
    expect(buff).toBeDefined();
    expect(buff!.attackBonus).toBe(1);
    expect(buff!.damageBonus).toBe(0);
    expect(buff!.extraDamageDice).toBe('1d4');
    expect(buff!.extraDamageType).toBe('fire');
  });

  it.each([
    [3, 1, '1d4'],
    [4, 1, '1d4'],
    [5, 2, '2d4'],
    [6, 2, '2d4'],
    [7, 3, '3d4'],
    [9, 3, '3d4'],
  ])('slot %d → +%d attack and %s extra damage', (slotLevel, expectedBonus, expectedDice) => {
    const { engine, campaign, longsword, caster } = buildCampaign(19);
    const events = engine.plan.elementalWeapon(campaign.state, {
      casterId: caster.id,
      weaponInstanceId: longsword.id,
      slotLevel,
      damageType: 'cold',
    }).events;
    const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
    expect(buff).toBeDefined();
    expect(buff!.attackBonus).toBe(expectedBonus);
    expect(buff!.extraDamageDice).toBe(expectedDice);
  });

  it('after casting, the caster attack rolls extra damage of the chosen type on hit', () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const caster = buildCaster(19);
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `ew-attack-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);

      campaign = commit(
        campaign,
        engine.plan.elementalWeapon(campaign.state, {
          casterId: caster.id,
          weaponInstanceId: longsword.id,
          slotLevel: 3,
          damageType: 'lightning',
        }).events,
      );

      const attack = engine.plan.attack(campaign.state, {
        attackerId: caster.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attackRolled?.hit !== true) continue;

      // DamageRolled should now carry two rolls: weapon damage + extra
      // elemental dice.
      const damageRolled = attack.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(damageRolled).toBeDefined();
      expect(damageRolled!.rolls).toHaveLength(2);
      const extraRoll = damageRolled!.rolls[1];
      expect(extraRoll!.type).toBe('lightning');
      expect(extraRoll!.expression).toBe('1d4');
      // Crit doubles dice (2 dice instead of 1).
      const expectedDieCount = attackRolled.critical ? 2 : 1;
      expect(extraRoll!.rolls).toHaveLength(expectedDieCount);

      // DamageApplied should mitigate both components — the lightning
      // damage shows up as its own component.
      const damageApplied = attack.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      expect(damageApplied).toBeDefined();
      const lightningTotal = damageApplied!.components
        .filter((c) => c.type === 'lightning')
        .reduce((sum, c) => sum + c.amount, 0);
      expect(lightningTotal).toBeGreaterThanOrEqual(1);
      expect(lightningTotal).toBeLessThanOrEqual(attackRolled.critical ? 8 : 4);
      return;
    }
    throw new Error('no seed produced a hit');
  });

  it('attack-bonus path: the +1/+2/+3 attack bonus flows into the d20 roll', () => {
    // Two casts back-to-back can't stack — the second replaces the
    // first. We just confirm the stamp shows up on the item and the
    // attack-derive reads it via the existing path (slice 76).
    const { engine, campaign, longsword, caster } = buildCampaign(19);
    const post = commit(
      campaign,
      engine.plan.elementalWeapon(campaign.state, {
        casterId: caster.id,
        weaponInstanceId: longsword.id,
        slotLevel: 7,
        damageType: 'thunder',
      }).events,
    );
    expect(post.state.itemInstances[longsword.id]?.temporaryBuff?.attackBonus).toBe(3);
    expect(post.state.itemInstances[longsword.id]?.temporaryBuff?.extraDamageDice).toBe('3d4');
    expect(post.state.itemInstances[longsword.id]?.temporaryBuff?.extraDamageType).toBe('thunder');
  });

  it('throws when the damage type is not in the allowed list', () => {
    const { engine, campaign, longsword, caster } = buildCampaign(19);
    expect(() =>
      engine.plan.elementalWeapon(campaign.state, {
        casterId: caster.id,
        weaponInstanceId: longsword.id,
        slotLevel: 3,
        damageType: 'radiant',
      }),
    ).toThrow(/not in allowed list/);
  });

  it('throws when the slot is below 3', () => {
    const { engine, campaign, longsword, caster } = buildCampaign(19);
    expect(() =>
      engine.plan.elementalWeapon(campaign.state, {
        casterId: caster.id,
        weaponInstanceId: longsword.id,
        slotLevel: 2,
        damageType: 'fire',
      }),
    ).toThrow(/insufficient/);
  });
});
