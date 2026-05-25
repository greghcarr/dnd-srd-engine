// Slice 449: Rogue Thieves' Cant + Sprite Needle Sword + Sprite
// Enchanting Bow (Charmed-on-hit).
//
// Two unrelated content fixes batched per the L1 playability arc:
//   1. Rogue L1 Thieves' Cant: the only L1 class-feature stub that's
//      a one-line content wire. Adds the `thieves-cant` language
//      proficiency via the existing GrantProficiency primitive.
//   2. Sprite combat actions: two natural weapons (Needle Sword + bow)
//      wired as items in the pack. The Enchanting Bow uses the
//      slice-321 unconditional `applyConditionId` rider for Charmed.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildRogue = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sly',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 12, WIS: 12, CHA: 12 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildSprite = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Sprite',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'sprite',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 3, DEX: 18, CON: 10, INT: 14, WIS: 13, CHA: 11 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildPCTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
  });

describe('Rogue Thieves Cant language proficiency (slice 449)', () => {
  it('a L1 Rogue has the thieves-cant language proficiency in the effect stack', () => {
    const rogue = buildRogue();
    const stack = buildEffectStack({
      character: rogue,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    expect(stack.proficiencyLevel('language', 'thieves-cant')).toBe('proficient');
  });

  it('a non-rogue (human fighter) does NOT have thieves-cant proficiency', () => {
    const fighter: Character = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Wil',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
    });
    const stack = buildEffectStack({
      character: fighter,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    expect(stack.proficiencyLevel('language', 'thieves-cant')).toBe('none');
  });
});

describe('Sprite natural weapons (slice 449)', () => {
  it('Sprite Needle Sword attack against a target rolls a melee piercing attack', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const sword = makeItemInstance('sprite-needle-sword');
    const sprite = buildSprite();
    const target = buildPCTarget();
    let campaign = engine.createCampaign({ name: 'sprite-sword' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: sprite,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: sprite.id,
      targetId: target.id,
      weaponInstanceId: sword.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as
      | AttackRolledEvent
      | undefined;
    expect(attack).toBeDefined();
    expect(attack!.attackKind).toBe('melee');
  });

  it('Sprite Enchanting Bow hit on a target applies Charmed (slice-321 applyConditionId rider)', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt + 50) });
      const bow = makeItemInstance('sprite-enchanting-bow');
      const sprite = buildSprite();
      const target = buildPCTarget();
      let campaign = engine.createCampaign({ name: 'sprite-bow' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: sprite,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: target,
        } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: sprite.id,
        targetId: target.id,
        weaponInstanceId: bow.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (attack?.hit !== true) continue;
      const charmedApplied = events.some(
        (e) =>
          e.type === 'ConditionApplied' &&
          (e as ConditionAppliedEvent).conditionId === 'charmed' &&
          (e as ConditionAppliedEvent).targetId === target.id,
      );
      expect(charmedApplied).toBe(true);
      expect(attack!.attackKind).toBe('ranged');
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });
});
