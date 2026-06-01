// Slice 555: Goliath Giant Ancestry — Fire's Burn (Fire Giant).
//
// RAW (SRD 5.2.1 Goliath): "_Fire's Burn (Fire Giant)._ When you hit
// a target with an attack roll and deal damage to it, you can also
// deal 1d10 Fire damage to that target."
//
// Second of the 6-arm Giant Ancestry cohort. Wires via the slice-467
// Savage Attacker pattern: AttackIntent dial `useGiantAncestryFiresBurn`,
// pre-validation in resolveAttack, +1d10 fire damage on hit folded
// into the damage chain, ResourceSpent(giant-ancestry, 1) emitted
// only on hit (RAW "when you hit").

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
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';

const PACK = loadStarterPack();

const buildGoliath = (weaponInstanceId: string, opts: { resourceCurrent?: number } = {}): Character =>
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
    resources: [{ resourceId: 'giant-ancestry', current: opts.resourceCurrent ?? 2, max: 2 }],
  });

const buildHuman = (weaponInstanceId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    equipped: { mainHand: weaponInstanceId },
    inventory: [weaponInstanceId],
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
  ancestry: string | undefined,
) => {
  let campaign = engine.createCampaign({ name: 'fb' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ...items.map<ItemAcquiredEvent>((i) => ({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: i })),
    ...(ancestry !== undefined ? seedAncestry(attacker.id, ancestry) : []),
  ]);
  return campaign;
};

const findHittingAttack = (
  baseEngine: ReturnType<typeof createEngine>,
  campaign: ReturnType<typeof baseEngine.createCampaign>,
  attackerId: string,
  targetId: string,
  weaponId: string,
  startSeed: number,
  extraIntentFields: { useGiantAncestryFiresBurn?: boolean } = {},
) => {
  for (let seed = startSeed; seed < startSeed + 80; seed++) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const { events } = engine.plan.attack(campaign.state, {
      attackerId, targetId, weaponInstanceId: weaponId, ...extraIntentFields,
    });
    const attack = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
    if (attack?.hit === true) return { events, attack };
  }
  return undefined;
};

const findMissingAttack = (
  baseEngine: ReturnType<typeof createEngine>,
  campaign: ReturnType<typeof baseEngine.createCampaign>,
  attackerId: string,
  targetId: string,
  weaponId: string,
  startSeed: number,
  extraIntentFields: { useGiantAncestryFiresBurn?: boolean } = {},
) => {
  for (let seed = startSeed; seed < startSeed + 80; seed++) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const { events } = engine.plan.attack(campaign.state, {
      attackerId, targetId, weaponInstanceId: weaponId, ...extraIntentFields,
    });
    const attack = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
    if (attack?.hit === false) return { events, attack };
  }
  return undefined;
};

describe("Goliath Fire's Burn (slice 555)", () => {
  it('happy path: +1d10 fire damage on hit + ResourceSpent emitted', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'fires-burn');
    const result = findHittingAttack(engine, campaign, goliath.id, dummy.id, longsword.id, 1, { useGiantAncestryFiresBurn: true });
    expect(result).toBeDefined();
    // DamageRolled should contain a 'fire' damage component
    const damageRolled = result!.events.find((e): e is DamageRolledEvent => (e as { type: string }).type === 'DamageRolled');
    expect(damageRolled).toBeDefined();
    const fireRoll = damageRolled!.rolls.find((r) => r.type === 'fire');
    expect(fireRoll).toBeDefined();
    expect(fireRoll!.expression).toBe('1d10');
    expect(fireRoll!.rolls.length).toBeGreaterThanOrEqual(1);
    // ResourceSpent emitted
    const resourceSpent = result!.events.find((e): e is { type: string; resourceId: string } =>
      (e as { type: string }).type === 'ResourceSpent') as { resourceId: string } | undefined;
    expect(resourceSpent).toBeDefined();
    expect(resourceSpent!.resourceId).toBe('giant-ancestry');
  });

  it('miss: no fire damage + no ResourceSpent', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    // Beefy target with high AC so attack misses
    const dummy = CharacterSchema.parse({
      id: newCharacterId(), name: 'Tank', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 20, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 60, max: 60, temp: 0 },
    });
    const campaign = seed(engine, goliath, dummy, [longsword], 'fires-burn');
    const result = findMissingAttack(engine, campaign, goliath.id, dummy.id, longsword.id, 1, { useGiantAncestryFiresBurn: true });
    if (result === undefined) return; // skip if no miss in seed window
    const damageRolled = result.events.find((e) => (e as { type: string }).type === 'DamageRolled');
    expect(damageRolled).toBeUndefined();
    const resourceSpent = result.events.find((e) => (e as { type: string }).type === 'ResourceSpent');
    expect(resourceSpent).toBeUndefined();
  });

  it('non-Goliath attacker: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const longsword = makeItemInstance('longsword');
    const human = buildHuman(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, human, dummy, [longsword], undefined);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: human.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryFiresBurn: true,
    })).toThrow(/not a Goliath/);
  });

  it('Goliath with wrong ancestry (Cloud\'s Jaunt): rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'clouds-jaunt');
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: goliath.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryFiresBurn: true,
    })).toThrow(/did not choose Fire's Burn/);
  });

  it('depleted Giant Ancestry: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id, { resourceCurrent: 0 });
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'fires-burn');
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: goliath.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryFiresBurn: true,
    })).toThrow(/no Giant Ancestry uses remaining/);
  });

  it('without useGiantAncestryFiresBurn flag: no fire damage, no resource use', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'fires-burn');
    const result = findHittingAttack(engine, campaign, goliath.id, dummy.id, longsword.id, 1);
    expect(result).toBeDefined();
    const damageRolled = result!.events.find((e): e is DamageRolledEvent => (e as { type: string }).type === 'DamageRolled');
    expect(damageRolled!.rolls.find((r) => r.type === 'fire')).toBeUndefined();
    expect(result!.events.find((e) => (e as { type: string }).type === 'ResourceSpent')).toBeUndefined();
  });
});
