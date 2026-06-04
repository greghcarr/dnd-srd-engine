// Slice 557: Goliath Giant Ancestry — Hill's Tumble (Hill Giant).
//
// RAW (SRD 5.2.1 Goliath): "_Hill's Tumble (Hill Giant)._ When you
// hit a Large or smaller creature with an attack roll and deal
// damage to it, you can give that target the Prone condition."
//
// Fourth of the 6-arm Giant Ancestry cohort. Reuses the slice-555
// attack-rider dial pattern + the slice-556 ConditionApplied
// pattern. The Large-or-smaller gate is enforced pre-attack so the
// Prone condition is only attempted on valid targets.
//
// Also: extracts the shared `validateGoliathAncestry` helper that
// slices 555/556/557 all reuse (promised in slice-555 audit when
// the third sibling arrived).

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
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
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
  let campaign = engine.createCampaign({ name: 'ht' });
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
  extraFields: { useGiantAncestryHillsTumble?: boolean } = {},
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

describe("Goliath Hill's Tumble (slice 557)", () => {
  it('happy path: hit on Medium target → ConditionApplied(prone) + ResourceSpent', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'hills-tumble');
    const result = findHittingAttack(campaign, goliath.id, dummy.id, longsword.id, { useGiantAncestryHillsTumble: true });
    expect(result).toBeDefined();
    const condApplied = result!.events.find(
      (e) => (e as { type: string }).type === 'ConditionApplied'
        && (e as { conditionId?: string }).conditionId === 'prone',
    ) as ConditionAppliedEvent | undefined;
    expect(condApplied).toBeDefined();
    expect(condApplied!.targetId).toBe(dummy.id);
    expect(condApplied!.sourceCharacterId).toBe(goliath.id);
    const resourceSpent = result!.events.find((e) => (e as { type: string }).type === 'ResourceSpent') as { resourceId: string } | undefined;
    expect(resourceSpent?.resourceId).toBe('giant-ancestry');
  });

  it('target larger than Large (Huge): rejected pre-attack', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    // Use a Hill Giant monster statblock (RAW Huge); creatureSize
    // derives via character.statblockId.
    const huge = CharacterSchema.parse({
      id: newCharacterId(), name: 'Hill Giant', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 20, DEX: 8, CON: 20, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 100, max: 100, temp: 0 },
      statblockId: 'hill-giant',
    });
    const campaign = seed(engine, goliath, huge, [longsword], 'hills-tumble');
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: goliath.id, targetId: huge.id, weaponInstanceId: longsword.id,
      useGiantAncestryHillsTumble: true,
    })).toThrow(/Huge, larger than Large|Hill's Tumble only fells/);
  });

  it('non-Goliath rejected via shared helper', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const longsword = makeItemInstance('longsword');
    const human = CharacterSchema.parse({
      id: newCharacterId(), name: 'H', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
      equipped: { mainHand: longsword.id }, inventory: [longsword.id],
    });
    const dummy = buildDummy();
    let campaign = engine.createCampaign({ name: 'ht-h' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
    ] as never[]);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: human.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryHillsTumble: true,
    })).toThrow(/not a Goliath/);
  });

  it('wrong ancestry chosen: rejected via shared helper', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'fires-burn');
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: goliath.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryHillsTumble: true,
    })).toThrow(/did not choose Hill's Tumble/);
  });

  it('depleted Giant Ancestry: rejected via shared helper', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id, { resourceCurrent: 0 });
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'hills-tumble');
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: goliath.id, targetId: dummy.id, weaponInstanceId: longsword.id,
      useGiantAncestryHillsTumble: true,
    })).toThrow(/no Giant Ancestry uses remaining/);
  });

  it('without dial: no Prone, no ResourceSpent', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const longsword = makeItemInstance('longsword');
    const goliath = buildGoliath(longsword.id);
    const dummy = buildDummy();
    const campaign = seed(engine, goliath, dummy, [longsword], 'hills-tumble');
    const result = findHittingAttack(campaign, goliath.id, dummy.id, longsword.id);
    expect(result).toBeDefined();
    expect(result!.events.find(
      (e) => (e as { type: string }).type === 'ConditionApplied'
        && (e as { conditionId?: string }).conditionId === 'prone',
    )).toBeUndefined();
    expect(result!.events.find((e) => (e as { type: string }).type === 'ResourceSpent')).toBeUndefined();
  });
});
