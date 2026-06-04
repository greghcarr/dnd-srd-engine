// Slice 493: Death Dog disease (partial — onHit save + 24-hour cure
// save). Closes the last remaining slot in the slice-477 iconic
// beast/monstrosity traits queue.
//
// RAW (SRD 5.2.1 Death Dog, CR 1): "Bite. Melee Attack Roll: +4,
// reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage. If the target is a
// creature, it is subjected to the following effect. Constitution
// Saving Throw: DC 12. First Failure: The target has the Poisoned
// condition. While Poisoned, the target's Hit Point maximum doesn't
// return to normal when finishing a Long Rest, and it repeats the save
// every 24 hours that elapse, ending the effect on itself on a
// success. Subsequent Failures: The Poisoned target's Hit Point
// maximum decreases by 5 (1d10)."
//
// Engine addition (this slice):
//   - RecurringSave.trigger enum gains 'longRest' (slice 493). Purely
//     metadata — the consumer drives ticks; the engine doesn't track
//     hours. Existing 'turnStart' / 'turnEnd' values unchanged.
//
// Content additions:
//   - `death-dog-disease-active` condition: copies Poisoned's effects
//     directly + recurringSave { ability: CON, fixedDC 12,
//     trigger 'longRest', onSuccess 'removeCondition' }.
//   - `death-dog-bite` weapon: gains the slice-319 onHit save rider
//     (CON DC 12 -> conditionOnFail death-dog-disease-active).
//
// Deferred RAW arms (consumer-managed):
//   - "HP max doesn't return on long rest": engine doesn't model
//     HP-max-restore semantics, so the long-rest reducer currently
//     leaves max untouched anyway.
//   - "Subsequent Failures: HP max decreases by 1d10": needs an
//     HP-max-decay accumulator + a new onFail variant.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
} from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildDeathDog = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Death Dog',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'death-dog',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 15, DEX: 14, CON: 14, INT: 3, WIS: 13, CHA: 6 },
    hp: { current: 39, max: 39, temp: 0 },
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

describe('Death Dog disease (slice 493)', () => {
  it('death-dog-bite weapon has the slice-319 onHit save rider (CON DC 12 -> death-dog-disease-active)', () => {
    const w = PACK.items.find((i) => i.id === 'death-dog-bite');
    expect(w).toBeDefined();
    if (!w || w.itemKind !== 'weapon') throw new Error('death-dog-bite missing');
    expect(w.onHit).toEqual([
      { save: { ability: 'CON', dc: 12, conditionOnFail: 'death-dog-disease-active' } },
    ]);
  });

  it('death-dog-disease-active condition declares the slice-493 shape (Poisoned effects + 24h save)', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'death-dog-disease-active');
    expect(c).toBeDefined();
    expect(c?.category).toBe('disease');
    expect(c?.effects).toEqual([
      { kind: 'SetAdvantage', on: 'attack', mode: 'disadvantage' },
      { kind: 'SetAdvantage', on: { kind: 'check' }, mode: 'disadvantage' },
    ]);
    expect(c?.recurringSave).toEqual({
      ability: 'CON',
      fixedDC: 12,
      trigger: 'longRest',
      onSuccess: 'removeCondition',
    });
  });

  it('on a hit + failed save, death-dog-disease-active is applied to the target', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const bite = makeItemInstance('death-dog-bite');
      const dog = buildDeathDog();
      const hero = buildHero(8); // CON 8 -> -1 mod, more likely to fail DC 12
      let campaign: Campaign = engine.createCampaign({ name: `bite-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dog } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: dog.id,
        targetId: hero.id,
        weaponInstanceId: bite.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as { hit?: boolean } | undefined;
      if (attack?.hit !== true) continue;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save === undefined) continue;
      if (save.success === true) continue;
      expect(save.dc).toBe(12);
      expect(save.ability).toBe('CON');
      const applied = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'death-dog-disease-active',
      ) as ConditionAppliedEvent | undefined;
      expect(applied).toBeDefined();
      expect(applied?.targetId).toBe(hero.id);
      return;
    }
    throw new Error('Could not find a Death Dog hit + failed save seed');
  });

  it('planTickRecurringSave on death-dog-disease-active: on success the condition lifts', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const dog = buildDeathDog();
      const hero = buildHero(20); // max CON to maximize success odds
      const heroSick: Character = {
        ...hero,
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'death-dog-disease-active',
          sourceCharacterId: dog.id,
        }],
      };
      let campaign: Campaign = engine.createCampaign({ name: `cure-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dog } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: heroSick } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.tickRecurringSave(campaign.state, {
        targetId: heroSick.id,
        conditionId: 'death-dog-disease-active',
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success !== true) continue;
      const removed = events.find(
        (e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'death-dog-disease-active',
      );
      expect(removed).toBeDefined();
      return;
    }
    throw new Error('Could not find a passed-cure-save seed');
  });

  it('death-dog-disease-active is removable via Lesser Restoration / Greater Restoration (category disease)', () => {
    // Slice 134's removal taxonomy: a category-tagged condition is reachable
    // by the matching `remove-condition` planner. Disease => Lesser
    // Restoration. Pin the tag here so the disease arm is correctly
    // categorized for removal-spell coverage when those spells fire.
    const c = PACK.conditions.find((cc) => cc.id === 'death-dog-disease-active');
    expect(c?.category).toBe('disease');
  });
});
