// Slice 556: Goliath Giant Ancestry — Frost's Chill (Frost Giant).
//
// RAW (SRD 5.2.1 Goliath): "_Frost's Chill (Frost Giant)._ When you
// hit a target with an attack roll and deal damage to it, you can
// also deal 1d6 Cold damage to that target and reduce its Speed by
// 10 feet until the start of your next turn."
//
// Third of the 6-arm Giant Ancestry cohort. Mirrors slice 555's
// Fire's Burn shape (attack-rider dial + on-hit damage + on-hit
// resource consumption) and adds an on-hit ConditionApplied of a
// new `frosts-chill-slowed` condition that projects -10 ft walk
// speed with autoExpiry at start-of-attacker's-next-turn.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';

const PACK = loadStarterPack();

const buildGoliath = (weaponInstanceId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grog',
    speciesId: 'goliath',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 14, max: 14, temp: 0 },
    equipped: { mainHand: weaponInstanceId },
    inventory: [weaponInstanceId],
    resources: [{ resourceId: 'giant-ancestry', current: 2, max: 2 }],
  });

const buildDummy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const seedAncestry = (characterId: string, selected: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  const options = [
    { id: 'clouds-jaunt', label: "Cloud's Jaunt", effects: [] },
    { id: 'fires-burn', label: "Fire's Burn", effects: [] },
    { id: 'frosts-chill', label: "Frost's Chill", effects: [] },
    { id: 'hills-tumble', label: "Hill's Tumble", effects: [] },
    { id: 'stones-endurance', label: "Stone's Endurance", effects: [] },
    { id: 'storms-thunder', label: "Storm's Thunder", effects: [] },
  ];
  return [
    { id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId, characterId,
      promptKey: 'goliath-giant-ancestry', prompt: 'Choose a Giant Ancestry.', options, oneOf: 1 },
    { id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId, characterId,
      selectedOptionIds: [selected] },
  ];
};

const seed = (
  engine: ReturnType<typeof createEngine>,
  attacker: Character,
  target: Character,
  items: ItemInstance[],
  ancestry: string,
) => {
  let campaign = engine.createCampaign({ name: 'fc' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ...items.map<ItemAcquiredEvent>((i) => ({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: i })),
    ...seedAncestry(attacker.id, ancestry),
  ]);
  return campaign;
};

const findHittingAttack = (
  campaign: ReturnType<ReturnType<typeof createEngine>['createCampaign']>,
  attackerId: string,
  targetId: string,
  weaponId: string,
  extraFields: { useGiantAncestryFrostsChill?: boolean } = {},
) => {
  for (let seed = 1; seed < 80; seed++) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const { events } = engine.plan.attack(campaign.state, {
      attackerId, targetId, weaponInstanceId: weaponId, ...extraFields,
    });
    const attack = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
    if (attack?.hit === true) return { events };
  }
  return undefined;
};

describe("Goliath Frost's Chill (slice 556)", () => {
  it('frosts-chill-slowed condition: in pack, -10 ft walk, autoExpiry 1 round turnStart', () => {
    const condition = PACK.conditions?.find((c) => c.id === 'frosts-chill-slowed');
    expect(condition).toBeDefined();
    expect(condition?.autoExpiry?.afterRounds).toBe(1);
    expect(condition?.autoExpiry?.trigger).toBe('turnStart');
    const speedEffect = condition?.effects.find((e) => e.kind === 'ModifySpeed') as { value: number; op: string; mode: string } | undefined;
    expect(speedEffect).toBeDefined();
    expect(speedEffect!.mode).toBe('walk');
    expect(speedEffect!.op).toBe('add');
    expect(speedEffect!.value).toBe(-10);
  });

  it('happy path: hit emits +1d6 cold + ResourceSpent + ConditionApplied(frosts-chill-slowed)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'frosts-chill');
    const result = findHittingAttack(campaign, goliath.id, dummy.id, longsword.id, { useGiantAncestryFrostsChill: true });
    expect(result).toBeDefined();
    const damageRolled = result!.events.find((e): e is DamageRolledEvent => (e as { type: string }).type === 'DamageRolled');
    const coldRoll = damageRolled?.rolls.find((r) => r.type === 'cold');
    expect(coldRoll).toBeDefined();
    expect(coldRoll!.expression).toBe('1d6');
    const resourceSpent = result!.events.find((e) => (e as { type: string }).type === 'ResourceSpent') as { resourceId: string } | undefined;
    expect(resourceSpent?.resourceId).toBe('giant-ancestry');
    const condApplied = result!.events.find(
      (e) => (e as { type: string }).type === 'ConditionApplied'
        && (e as { conditionId?: string }).conditionId === 'frosts-chill-slowed',
    ) as ConditionAppliedEvent | undefined;
    expect(condApplied).toBeDefined();
    expect(condApplied!.targetId).toBe(dummy.id);
    expect(condApplied!.sourceCharacterId).toBe(goliath.id);
  });

  it('non-Goliath rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const longsword = makeItemInstance('longsword');
    const human = CharacterSchema.parse({
      id: newCharacterId(), name: 'H', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
      equipped: { mainHand: longsword.id }, inventory: [longsword.id],
    });
    const dummy = buildDummy();
    let campaign = engine.createCampaign({ name: 'fc-h' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
    ] as never[]);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: human.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryFrostsChill: true,
    })).toThrow(/not a Goliath/);
  });

  it('wrong ancestry chosen rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'fires-burn');
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: goliath.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryFrostsChill: true,
    })).toThrow(/did not choose Frost's Chill/);
  });

  it('without dial: no cold roll, no condition, no resource use', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'frosts-chill');
    const result = findHittingAttack(campaign, goliath.id, dummy.id, longsword.id);
    expect(result).toBeDefined();
    const damageRolled = result!.events.find((e): e is DamageRolledEvent => (e as { type: string }).type === 'DamageRolled');
    expect(damageRolled!.rolls.find((r) => r.type === 'cold')).toBeUndefined();
    expect(result!.events.find((e) => (e as { type: string }).type === 'ResourceSpent')).toBeUndefined();
    expect(result!.events.find(
      (e) => (e as { type: string }).type === 'ConditionApplied'
        && (e as { conditionId?: string }).conditionId === 'frosts-chill-slowed',
    )).toBeUndefined();
  });
});
