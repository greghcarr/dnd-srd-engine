// Slice 488: Cockatrice Petrifying Bite (two-failure escalation).
//
// RAW (SRD 5.2.1 Cockatrice, CR 1/2): "Petrifying Bite. Melee Attack
// Roll: +3, reach 5 ft. Hit: 3 (1d4 + 1) Piercing damage. If the
// target is a creature, it is subjected to the following effect.
// Constitution Saving Throw: DC 11. First Failure: The target has
// the Restrained condition. The target repeats the save at the end
// of its next turn if it is still Restrained, ending the effect on
// itself on a success. Second Failure: The target has the Petrified
// condition, instead of the Restrained condition, for 24 hours."
//
// Engine additions:
//   - RecurringSaveSchema.fixedDC (slice 488): condition-definition
//     fixed DC, skips caster spell-DC resolution. Lets monster-driven
//     conditions repeat their save against a printed DC instead of a
//     caster's spell DC.
//   - RecurringSaveSchema.onFail 'escalateToCondition' +
//     escalateToConditionId: removes the current condition and applies
//     the named target on a failed save.
//   - planTickRecurringSave honors both: uses fixedDC when set, emits
//     ConditionRemoved + ConditionApplied(<escalate>) on failure.
//
// Content additions:
//   - `cockatrice-restrained-active` condition: Restrained's effects +
//     recurringSave { ability: CON, fixedDC: 11, trigger: 'turnEnd',
//     onSuccess: 'removeCondition', onFail: 'escalateToCondition',
//     escalateToConditionId: 'petrified' }.
//   - `cockatrice-bite` weapon: 1d4 piercing + onHit save CON DC 11 ->
//     conditionOnFail 'cockatrice-restrained-active'.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildCockatrice = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Cockatrice',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'cockatrice',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 6, DEX: 12, CON: 12, INT: 2, WIS: 13, CHA: 5 },
    hp: { current: 22, max: 22, temp: 0 },
  });

const buildHero = (CON: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Cockatrice Petrifying Bite (slice 488)', () => {
  it('cockatrice-bite is a 1d4 piercing weapon with a CON DC 11 save onHit rider', () => {
    const w = PACK.items.find((i) => i.id === 'cockatrice-bite');
    expect(w).toBeDefined();
    if (!w || w.itemKind !== 'weapon') throw new Error('cockatrice-bite missing');
    expect(w.damageDice).toBe('1d4');
    expect(w.damageType).toBe('piercing');
    expect(w.onHit).toEqual([
      { save: { ability: 'CON', dc: 11, conditionOnFail: 'cockatrice-restrained-active' } },
    ]);
  });

  it('cockatrice-restrained-active declares the slice-488 recurring-save escalation shape', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'cockatrice-restrained-active');
    expect(c).toBeDefined();
    expect(c?.recurringSave).toEqual({
      ability: 'CON',
      fixedDC: 11,
      trigger: 'turnEnd',
      onSuccess: 'removeCondition',
      onFail: 'escalateToCondition',
      escalateToConditionId: 'petrified',
    });
    // Carries Restrained's effects directly (avoids a "condition extends
    // condition" mechanism the engine doesn't have).
    expect(c?.effects).toEqual([
      { kind: 'ModifySpeed', mode: 'walk', op: 'set', value: 0 },
      { kind: 'SetAdvantage', on: 'attack', mode: 'disadvantage' },
      { kind: 'SetAdvantage', on: { kind: 'save', ability: 'DEX' }, mode: 'disadvantage' },
      { kind: 'GrantAdvantageToAttackers' },
    ]);
  });

  it('a hit forces a CON DC 11 save; on failure, Restrained applied to the target', () => {
    // Find a seed where (a) the attack hits, and (b) the target fails the save.
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const bite = makeItemInstance('cockatrice-bite');
      const cockatrice = buildCockatrice();
      const hero = buildHero(8); // CON 8 -> -1 mod, lowers odds of save success
      let campaign: Campaign = engine.createCampaign({ name: `bite-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cockatrice } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: cockatrice.id,
        targetId: hero.id,
        weaponInstanceId: bite.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as { hit?: boolean } | undefined;
      if (attack?.hit !== true) continue;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save === undefined) continue;
      if (save.success === true) continue;
      // Found a hit-fail-save seed.
      expect(save.dc).toBe(11);
      expect(save.ability).toBe('CON');
      const applied = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'cockatrice-restrained-active',
      ) as ConditionAppliedEvent | undefined;
      expect(applied).toBeDefined();
      expect(applied?.targetId).toBe(hero.id);
      return;
    }
    throw new Error('Could not find a seed where Cockatrice hit + target failed save');
  });

  it('planTickRecurringSave on cockatrice-restrained-active: on failed CON save, removes Restrained + applies Petrified', () => {
    // Seed the target with the condition (already applied via a previous bite).
    // Then tick the recurring save with a seed that produces a low roll.
    for (let seed = 1; seed < 30; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const cockatrice = buildCockatrice();
      const hero = buildHero(8); // CON 8 -> -1 mod
      const heroWithCond: Character = {
        ...hero,
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'cockatrice-restrained-active',
          sourceCharacterId: cockatrice.id,
        }],
      };
      let campaign: Campaign = engine.createCampaign({ name: `tick-fail-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cockatrice } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: heroWithCond } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.tickRecurringSave(campaign.state, {
        targetId: heroWithCond.id,
        conditionId: 'cockatrice-restrained-active',
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success === true) continue;
      // Failed save: expect ConditionRemoved + ConditionApplied(petrified).
      expect(save?.dc).toBe(11);
      const removed = events.find(
        (e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'cockatrice-restrained-active',
      );
      expect(removed).toBeDefined();
      const petrified = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'petrified',
      ) as ConditionAppliedEvent | undefined;
      expect(petrified).toBeDefined();
      expect(petrified?.sourceCharacterId).toBe(cockatrice.id);
      return;
    }
    throw new Error('Could not find a seed where the recurring save failed');
  });

  it('planTickRecurringSave: on a successful save, removes Restrained without applying Petrified', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const cockatrice = buildCockatrice();
      const hero = buildHero(20); // CON 20 -> +5 mod, max odds of save success
      const heroWithCond: Character = {
        ...hero,
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'cockatrice-restrained-active',
          sourceCharacterId: cockatrice.id,
        }],
      };
      let campaign: Campaign = engine.createCampaign({ name: `tick-pass-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cockatrice } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: heroWithCond } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.tickRecurringSave(campaign.state, {
        targetId: heroWithCond.id,
        conditionId: 'cockatrice-restrained-active',
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success !== true) continue;
      // Successful save: expect ConditionRemoved, no ConditionApplied(petrified).
      const removed = events.find(
        (e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'cockatrice-restrained-active',
      );
      expect(removed).toBeDefined();
      const petrified = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'petrified',
      );
      expect(petrified).toBeUndefined();
      return;
    }
    throw new Error('Could not find a seed where the recurring save succeeded');
  });
});
