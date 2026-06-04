// Slice 518: Pact of the Blade invocation + `GrantPactBlade` marker +
// `planConjurePactWeapon` planner.
//
// RAW (Pact of the Blade): "As a Bonus Action, you can conjure a pact
// weapon in your hand — a Simple or Martial Melee weapon of your
// choice with which you bond... Whenever you attack with the bonded
// weapon, you can use your Charisma modifier for the attack and damage
// rolls instead of using Strength or Dexterity; and you can cause the
// weapon to deal Necrotic, Psychic, or Radiant damage or its normal
// damage type."
//
// Engine surface: the invocation grants `GrantPactBlade` (presence
// marker, slice 518). `planConjurePactWeapon` validates the bearer has
// the marker + the chosen weapon is a Simple or Martial Melee weapon,
// consumes the Bonus Action when in combat, and emits ItemAcquired +
// ItemEquipped(mainHand) + ItemBuffApplied with `abilityOverride: 'CHA'`
// and optional `damageTypeOverride` (slice 501 buff fields). The attack
// resolver reads the buff at next attack time.
//
// Documented RAW deviations:
//   - per-hit damage-type choice collapsed to conjure-time (mirror of
//     slice 501's Shillelagh approach).
//   - Bonded-weapon proficiency arm not modeled.
//   - Spellcasting-focus + bond-ends conditions consumer-managed.
//   - Each conjure creates a new instance; prior-bond cleanup is the
//     consumer's responsibility.

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { ItemBuffAppliedEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWarlock = (cha = 18): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: cha },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: [],
    preparedSpells: [],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
    armorClass: 5,
  });

const seedPactBladePick = (characterId: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
      options: [{ id: 'pact-of-the-blade', label: 'Pact of the Blade', effects: [{ kind: 'GrantFeat', featId: 'pact-of-the-blade' }] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: ['pact-of-the-blade'],
    },
  ];
};

describe('Pact of the Blade (slice 518)', () => {
  it('ships pact-of-the-blade as an invocation with the GrantPactBlade marker', () => {
    const feat = PACK.feats.find((f) => f.id === 'pact-of-the-blade');
    expect(feat).toBeDefined();
    expect(feat!.category).toBe('invocation');
    expect(feat!.effects).toEqual([{ kind: 'GrantPactBlade' }]);
  });

  it("a warlock's effect stack projects hasPactBlade = true after picking the invocation", () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(518) });
    let campaign: Campaign = engine.createCampaign({ name: 'marker' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedPactBladePick(warlock.id),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.hasPactBlade()).toBe(true);
  });

  it('a warlock WITHOUT Pact of the Blade cannot conjure', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(519) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-pact' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.conjurePactWeapon(campaign.state, {
        characterId: warlock.id,
        weaponDefinitionId: 'longsword',
      }),
    ).toThrow(/does not have the Pact of the Blade invocation/i);
  });

  it('conjure emits ItemAcquired + ItemEquipped(mainHand) + ItemBuffApplied with abilityOverride CHA', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(520) });
    let campaign: Campaign = engine.createCampaign({ name: 'conjure' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedPactBladePick(warlock.id),
    ]);
    const events = engine.plan.conjurePactWeapon(campaign.state, {
      characterId: warlock.id,
      weaponDefinitionId: 'longsword',
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('ItemAcquired');
    expect(types).toContain('ItemEquipped');
    expect(types).toContain('ItemBuffApplied');
    const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
    expect(buff).toBeDefined();
    expect(buff!.abilityOverride).toBe('CHA');
    expect(buff!.source).toBe('pact-blade');
    expect(buff!.damageTypeOverride).toBeUndefined();
  });

  it('conjure with damageTypeOverride: necrotic stamps damageTypeOverride on the buff', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(521) });
    let campaign: Campaign = engine.createCampaign({ name: 'conjure-necrotic' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedPactBladePick(warlock.id),
    ]);
    const events = engine.plan.conjurePactWeapon(campaign.state, {
      characterId: warlock.id,
      weaponDefinitionId: 'longsword',
      damageTypeOverride: 'necrotic',
    }).events;
    const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
    expect(buff!.damageTypeOverride).toBe('necrotic');
  });

  it('rejects conjuring a ranged weapon (Melee only)', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(522) });
    let campaign: Campaign = engine.createCampaign({ name: 'reject-ranged' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedPactBladePick(warlock.id),
    ]);
    expect(() =>
      engine.plan.conjurePactWeapon(campaign.state, {
        characterId: warlock.id,
        weaponDefinitionId: 'longbow',
      }),
    ).toThrow(/Melee weapon/i);
  });

  it('rejects an invalid damageTypeOverride (only Necrotic / Psychic / Radiant allowed)', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(523) });
    let campaign: Campaign = engine.createCampaign({ name: 'reject-fire' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedPactBladePick(warlock.id),
    ]);
    expect(() =>
      engine.plan.conjurePactWeapon(campaign.state, {
        characterId: warlock.id,
        weaponDefinitionId: 'longsword',
        damageTypeOverride: 'fire',
      }),
    ).toThrow(/Necrotic, Psychic, or Radiant/i);
  });

  it('end-to-end: after conjuring, an attack with the pact weapon uses CHA mod (not STR) and the chosen damage type', () => {
    const warlock = buildWarlock(18); // CHA 18 -> +4
    const target = buildTarget();
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let campaign: Campaign = engine.createCampaign({ name: `attack-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ...seedPactBladePick(warlock.id),
      ]);
      const conjure = engine.plan.conjurePactWeapon(campaign.state, {
        characterId: warlock.id,
        weaponDefinitionId: 'longsword',
        damageTypeOverride: 'radiant',
      }).events;
      campaign = commit(campaign, conjure);
      const mainHand = campaign.state.characters[warlock.id]!.equipped.mainHand;
      expect(mainHand).toBeDefined();
      const attack = engine.plan.attack(campaign.state, {
        attackerId: warlock.id,
        targetId: target.id,
        weaponInstanceId: mainHand!,
      }).events;
      const attackRoll = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      expect(attackRoll).toBeDefined();
      // Warlock CHA 18 (+4), STR 8 (-1); not class-proficient with
      // martial weapons (longsword is martial) so PB doesn't apply.
      // With Pact of the Blade abilityOverride: attackBonus = CHA mod = +4.
      expect(attackRoll!.attackBonus).toBe(4);
      if (attackRoll!.hit !== true) continue;
      const dmg = attack.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(dmg).toBeDefined();
      // Damage modifier = CHA mod (+4); damage type = radiant (override).
      expect(dmg!.rolls[0]!.modifier).toBe(4);
      expect(dmg!.rolls[0]!.type).toBe('radiant');
      return;
    }
    throw new Error('no hit across 40 seeds');
  });
});
