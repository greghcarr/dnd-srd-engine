import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

// Tests Hex's target-side, source-filtered on-hit rider. The hex condition
// lives on the cursed target; the rider fires only when the target is
// attacked by the original caster (the AppliedCondition's
// `sourceCharacterId`). Slice 88 added the `event.attackerIsSource` fact
// to make this filter possible; before, an OnEvent rider on the target
// couldn't distinguish the hex caster from any other attacker.

const PACK = loadStarterPack();

const buildHexer = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: [],
    preparedSpells: ['hex'],
  });

const buildOtherAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bystander Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: [],
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

describe("Hex's target-side, source-filtered on-hit rider", () => {
  it("the hex caster's hit fires +1d6 necrotic", () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const hexer = buildHexer('Hexer');
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `hex-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hexer } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);

      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: hexer.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        }).events,
      );

      // Confirm the condition's source is the hexer. Slice 565: the
      // single hexed-active condition was replaced with one variant per
      // chosen ability; the STR variant is selected here.
      const hexedCondition = campaign.state.characters[target.id]
        ?.appliedConditions.find((c) => c.conditionId === 'hexed-STR-active');
      expect(hexedCondition).toBeDefined();
      expect(hexedCondition!.sourceCharacterId).toBe(hexer.id);

      const attack = engine.plan.attack(campaign.state, {
        attackerId: hexer.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attackRolled?.hit !== true) continue;

      const necroticDamage = attack.find(
        (e) =>
          e.type === 'DamageApplied'
          && (e as DamageAppliedEvent).components.some((c) => c.type === 'necrotic'),
      ) as DamageAppliedEvent | undefined;
      expect(necroticDamage, 'expected a necrotic DamageApplied from the hex rider').toBeDefined();
      const necroticAmount = necroticDamage!.components
        .filter((c) => c.type === 'necrotic')
        .reduce((sum, c) => sum + c.amount, 0);
      expect(necroticAmount).toBeGreaterThanOrEqual(1);
      expect(necroticAmount).toBeLessThanOrEqual(attackRolled.critical ? 12 : 6);
      return;
    }
    throw new Error('no seed produced a hit for the hex caster');
  });

  it("an attack by a non-caster does NOT fire the hex rider", () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const swordA = makeItemInstance('longsword');
      const swordB = makeItemInstance('longsword');
      const hexer = buildHexer('Hexer');
      const bystander = buildOtherAttacker();
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `hex-bystander-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: swordA },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: swordB },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hexer } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bystander } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);

      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: hexer.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        }).events,
      );

      const attack = engine.plan.attack(campaign.state, {
        attackerId: bystander.id,
        targetId: target.id,
        weaponInstanceId: swordB.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attackRolled?.hit !== true) continue;

      // Damage events should contain only the longsword's component types
      // (slashing typically), no necrotic from the rider.
      const necroticDamage = attack.find(
        (e) =>
          e.type === 'DamageApplied'
          && (e as DamageAppliedEvent).components.some((c) => c.type === 'necrotic'),
      );
      expect(necroticDamage, 'bystander attack should NOT fire the hex rider').toBeUndefined();
      return;
    }
    throw new Error('no seed produced a hit for the bystander');
  });

  it("Bestow Curse's extra-damage variant fires +1d8 necrotic on the caster's hit", () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const cleric = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Curser',
        speciesId: 'human',
        backgroundId: 'acolyte',
        classes: [{ classId: 'cleric', level: 7, hitDiceRemaining: 7 }],
        abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 12 },
        hp: { current: 42, max: 42, temp: 0 },
        featsTaken: [],
        preparedSpells: ['bestow-curse'],
      });
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `curse-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);

      const castEvents = engine.plan.castSpell(campaign.state, {
        characterId: cleric.id,
        spellId: 'bestow-curse',
        slotLevel: 3,
        targetIds: [target.id],
        casterChoice: { kind: 'variant', value: 'extra-damage' },
      }).events;
      const cursed = castEvents.find(
        (e) => e.type === 'ConditionApplied' && e.conditionId === 'cursed-vulnerable-active',
      );
      if (cursed === undefined) continue; // target made the save; try next seed
      campaign = commit(campaign, castEvents);

      const attack = engine.plan.attack(campaign.state, {
        attackerId: cleric.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attackRolled?.hit !== true) continue;

      const necroticDamage = attack.find(
        (e) =>
          e.type === 'DamageApplied'
          && (e as DamageAppliedEvent).components.some((c) => c.type === 'necrotic'),
      ) as DamageAppliedEvent | undefined;
      expect(necroticDamage).toBeDefined();
      const necroticAmount = necroticDamage!.components
        .filter((c) => c.type === 'necrotic')
        .reduce((sum, c) => sum + c.amount, 0);
      expect(necroticAmount).toBeGreaterThanOrEqual(1);
      expect(necroticAmount).toBeLessThanOrEqual(attackRolled.critical ? 16 : 8);
      return;
    }
    throw new Error('no seed produced both a failed save (curse applied) and a follow-up hit');
  });
});
