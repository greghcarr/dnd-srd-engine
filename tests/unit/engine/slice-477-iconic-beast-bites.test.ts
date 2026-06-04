// Slice 477: Giant Spider + Giant Centipede natural-weapon bites
// (iconic L1-dungeon foes).
//
// RAW (SRD 5.2.1):
// - Giant Spider (CR 1) Bite: "Hit: 7 (1d8 + 3) Piercing damage plus
//   7 (2d6) Poison damage." -> slice-316 unconditional damage rider.
// - Giant Centipede (CR 1/4) Bite: "Hit: 4 (1d4 + 2) Piercing damage,
//   and the target has the Poisoned condition until the start of the
//   centipede's next turn." -> slice-321 unconditional applyConditionId.
//
// Pure-content slice. Climb speeds already in the pack; Web Walker
// (Giant Spider) and Bloodied Fury / movement-conditional Gore (Boar)
// each need new primitives, deferred.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildSpider = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Giant Spider',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'giant-spider',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 16, CON: 12, INT: 2, WIS: 11, CHA: 4 },
    hp: { current: 26, max: 26, temp: 0 },
  });

const buildCentipede = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Giant Centipede',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'giant-centipede',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 5, DEX: 14, CON: 12, INT: 1, WIS: 7, CHA: 3 },
    hp: { current: 9, max: 9, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

describe('Giant Spider Bite (slice 477)', () => {
  it('pack declares giant-spider-bite as a simple melee weapon with a 2d6 poison onHit rider', () => {
    const bite = PACK.items.find((i) => i.id === 'giant-spider-bite');
    expect(bite).toBeDefined();
    expect(bite && bite.itemKind === 'weapon' ? bite.damageDice : undefined).toBe('1d8');
    expect(bite && bite.itemKind === 'weapon' ? bite.damageType : undefined).toBe('piercing');
    expect(bite && bite.itemKind === 'weapon' ? bite.onHit : undefined).toEqual([
      { dice: '2d6', damageType: 'poison' },
    ]);
  });

  it('on a hit: DamageRolled carries piercing primary + 2d6 poison rider', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const bite = makeItemInstance('giant-spider-bite');
      const spider = buildSpider();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'giant-spider-bite' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spider } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: spider.id,
        targetId: target.id,
        weaponInstanceId: bite.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const damage = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(damage).toBeDefined();
      const piercing = damage!.rolls.find((r) => r.type === 'piercing');
      const poison = damage!.rolls.find((r) => r.type === 'poison');
      expect(piercing).toBeDefined();
      expect(poison).toBeDefined();
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });
});

describe('Giant Centipede Bite (slice 477)', () => {
  it('pack declares giant-centipede-bite as a simple melee weapon with a Poisoned applyCondition rider', () => {
    const bite = PACK.items.find((i) => i.id === 'giant-centipede-bite');
    expect(bite).toBeDefined();
    expect(bite && bite.itemKind === 'weapon' ? bite.damageDice : undefined).toBe('1d4');
    expect(bite && bite.itemKind === 'weapon' ? bite.damageType : undefined).toBe('piercing');
    expect(bite && bite.itemKind === 'weapon' ? bite.onHit : undefined).toEqual([
      { applyConditionId: 'poisoned' },
    ]);
  });

  it('on a hit: target gets ConditionApplied(poisoned) (no save)', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const bite = makeItemInstance('giant-centipede-bite');
      const centipede = buildCentipede();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'giant-centipede-bite' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: centipede } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: centipede.id,
        targetId: target.id,
        weaponInstanceId: bite.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const poisoned = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'poisoned',
      ) as ConditionAppliedEvent | undefined;
      expect(poisoned).toBeDefined();
      expect(poisoned!.targetId).toBe(target.id);
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });
});
