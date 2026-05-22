// Golden scenario: aura primitive.
//
// Crusader's Mantle (L3 paladin) — concentration spell that emits a
// 30-ft aura granting +1d4 radiant on every weapon hit to the caster
// and listed allies. Wired via the existing `buff` mechanic + a
// condition (`crusaders-mantle-active`) carrying an `OnEvent` rider
// on weapon attack hits. The aura's range is metadata for consumers;
// when an ally leaves range the consumer is responsible for removing
// the condition.
//
// Aura of Courage (paladin L10) — passive ally projection via the
// new `GrantAura` effect (auraId, rangeFeet, allyConditionId). The
// paladin themselves gains Frightened immunity natively; the aura
// metadata tells consumers to apply `aura-of-courage-active` (which
// also grants Frightened immunity) to allies in range. Engine doesn't
// auto-project — position lookup is consumer-side.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { buildEffectStack } from '../../src/derive/effect-stack.js';
import { collectEffectsFromCharacter } from '../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance, loadPhbExtrasTestPack } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';

const buildPaladin = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ariadne',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 22 + level * 6, max: 22 + level * 6, temp: 0 },
    featsTaken: [],
    preparedSpells: ['crusaders-mantle'],
  });

const buildAlly = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 44, max: 44, temp: 0 },
    featsTaken: [],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ogre',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 80, max: 80, temp: 0 },
    featsTaken: [],
  });

describe('golden: aura primitive', () => {
  it("Crusader's Mantle: ally weapon hit fires +1d4 radiant", () => {
    const STARTER_PACK = loadStarterPack();
    let attempt = 0;
    let proven = false;
    while (attempt < 100 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [STARTER_PACK, loadPhbExtrasTestPack()], rng: seededRNG(attempt) });
      const paladinSword = makeItemInstance('longsword');
      const allySword = makeItemInstance('longsword');
      const paladin = buildPaladin(9);
      const ally = buildAlly('Helga');
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'crusaders-mantle' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: paladinSword },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: allySword },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: paladin,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: ally,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: target,
        } satisfies CharacterCreatedEvent,
      ]);

      // Cast Crusader's Mantle, listing the paladin + ally as targets
      // since the spell applies to "you and your allies within 30 ft".
      const castEvents = engine.plan.castSpell(campaign.state, {
        characterId: paladin.id,
        spellId: 'crusaders-mantle',
        slotLevel: 3,
        targetIds: [paladin.id, ally.id],
      }).events;
      campaign = commit(campaign, castEvents);

      // Both caster and ally should carry the crusaders-mantle-active
      // condition.
      expect(
        campaign.state.characters[paladin.id]?.appliedConditions.some(
          (c) => c.conditionId === 'crusaders-mantle-active',
        ),
      ).toBe(true);
      expect(
        campaign.state.characters[ally.id]?.appliedConditions.some(
          (c) => c.conditionId === 'crusaders-mantle-active',
        ),
      ).toBe(true);

      // The ally's weapon attack should fire the rider on hit.
      const allyAttack = engine.plan.attack(campaign.state, {
        attackerId: ally.id,
        targetId: target.id,
        weaponInstanceId: allySword.id,
      }).events;
      const allyHit = allyAttack.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (allyHit?.hit !== true) continue;
      const rider = allyAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('crusaders-mantle-rider'),
      );
      expect(rider).toBeDefined();
      proven = true;
    }
    expect(proven, `Crusader's Mantle ally rider did not fire across ${attempt} seeds`).toBe(true);
  });

  it('Aura of Courage: L10 paladin has GrantAura metadata and own Frightened immunity', () => {
    const STARTER_PACK = loadStarterPack();
    const STARTER_CONTENT = resolveContent([STARTER_PACK, loadPhbExtrasTestPack()]);
    const engine = createEngine({ contentPacks: [STARTER_PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const paladin = buildPaladin(10);
    let campaign = engine.createCampaign({ name: 'aura-of-courage' });
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: paladin,
      } satisfies CharacterCreatedEvent,
    ]);

    const effects = collectEffectsFromCharacter({
      character: campaign.state.characters[paladin.id]!,
      content: STARTER_CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const aura = effects.find(
      (e) => e.kind === 'GrantAura' && e.auraId === 'aura-of-courage',
    );
    expect(aura).toBeDefined();
    expect(aura).toMatchObject({
      kind: 'GrantAura',
      auraId: 'aura-of-courage',
      rangeFeet: 10,
      allyConditionId: 'aura-of-courage-active',
    });

    // The paladin's effect-accumulator should also flag Frightened immunity
    // natively (the sibling self-effect on the L10 feature).
    const stack = buildEffectStack({
      character: campaign.state.characters[paladin.id]!,
      content: STARTER_CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(stack.hasConditionImmunity('frightened')).toBe(true);
  });

  it("Aura of Courage's ally condition carries Frightened immunity when applied", () => {
    const STARTER_PACK = loadStarterPack();
    const STARTER_CONTENT = resolveContent([STARTER_PACK, loadPhbExtrasTestPack()]);
    const auraCondition = STARTER_CONTENT.conditions.get('aura-of-courage-active');
    expect(auraCondition).toBeDefined();
    const grantsFrightenedImmunity = auraCondition!.effects.some(
      (e) => e.kind === 'GrantConditionImmunity' && e.conditionId === 'frightened',
    );
    expect(grantsFrightenedImmunity).toBe(true);
  });
});
