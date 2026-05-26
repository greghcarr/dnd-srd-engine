// Slice 445: Pack Tactics consumer-coordinated fact.
//
// RAW (SRD 5.2.1, every Pack Tactics user): "The [creature] has Advantage
// on an attack roll against a creature if at least one of the [creature]'s
// allies is within 5 feet of the creature and the ally doesn't have the
// Incapacitated condition." The engine doesn't model positions, so the
// consumer signals the combined predicate (an ally within 5 ft of target
// AND that ally is not Incapacitated) as one boolean.
//
// Opt-in default: undefined produces no advantage (mirror of slice 279's
// `lightLevel`). The bearer must explicitly receive `true` to gain it.
//
// Canonical users wired in slice 445 at CR <= 1: wolf, dire-wolf, giant-rat,
// kobold-warrior. The trait is a `SetAdvantage on: 'attack' mode: 'advantage'`
// gated on `attacker.hasAllyAdjacentToTarget == true`.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildWolf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Wolf',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'wolf',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6 },
    hp: { current: 11, max: 11, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

describe('Pack Tactics (slice 445)', () => {
  it('Wolf attack with attackerHasAllyAdjacentToTarget=true rolls with advantage', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const bite = makeItemInstance('unarmed-strike');
    const wolf = buildWolf();
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'pack-tactics-adv' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: wolf,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      } satisfies CharacterCreatedEvent,
    ]);

    const events = engine.plan.attack(campaign.state, {
      attackerId: wolf.id,
      targetId: target.id,
      weaponInstanceId: bite.id,
      attackerHasAllyAdjacentToTarget: true,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as
      | AttackRolledEvent
      | undefined;
    expect(attack).toBeDefined();
    // Advantage means two d20 rolls, the higher used. The event carries
    // the rolls in the d20 dice array.
    expect(attack!.used).toBe('advantage');
    expect(attack!.d20.length).toBe(2);
  });

  it('Wolf attack with attackerHasAllyAdjacentToTarget=false rolls normally', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const bite = makeItemInstance('unarmed-strike');
    const wolf = buildWolf();
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'pack-tactics-false' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: wolf,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      } satisfies CharacterCreatedEvent,
    ]);

    const events = engine.plan.attack(campaign.state, {
      attackerId: wolf.id,
      targetId: target.id,
      weaponInstanceId: bite.id,
      attackerHasAllyAdjacentToTarget: false,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as
      | AttackRolledEvent
      | undefined;
    expect(attack).toBeDefined();
    expect(attack!.used).toBe('none');
    expect(attack!.d20.length).toBe(1);
  });

  it('Wolf attack with attackerHasAllyAdjacentToTarget omitted (undefined) rolls normally (opt-in default)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const bite = makeItemInstance('unarmed-strike');
    const wolf = buildWolf();
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'pack-tactics-undef' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: wolf,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      } satisfies CharacterCreatedEvent,
    ]);

    const events = engine.plan.attack(campaign.state, {
      attackerId: wolf.id,
      targetId: target.id,
      weaponInstanceId: bite.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as
      | AttackRolledEvent
      | undefined;
    expect(attack).toBeDefined();
    expect(attack!.used).toBe('none');
    expect(attack!.d20.length).toBe(1);
  });
});
