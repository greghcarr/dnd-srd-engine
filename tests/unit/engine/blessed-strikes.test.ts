// Unit test for Cleric Blessed Strikes (L7) — the second consumer of
// the on-hit trigger primitive shipped in slice 61 (after the five
// L1-L2 smite spells). When a cleric levels up to 7 and chooses Divine
// Strike, the `OnEvent` rider inside the chosen option fires +1d8
// radiant on each weapon-attack hit, once per turn.
//
// This test exercises Divine Strike. The alternate L7 option, Potent
// Spellcasting (+WIS to cantrip damage), was wired in slice 739 via an
// `AddModifier { target: 'damage' }` gated on the `event.spellLevel == 0`
// fact; its behavior is covered in slice-739-elemental-fury.test.ts.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const buildClericLevel6 = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sister Theia',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 6, hitDiceRemaining: 6 }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    hp: { current: 48, max: 48, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: [],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cultist',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

describe('cleric Blessed Strikes (Divine Strike)', () => {
  it('fires +1d8 radiant on a weapon hit, once per turn', () => {
    const STARTER_PACK = loadStarterPack();
    let attempt = 0;
    let proven = false;
    while (attempt < 100 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [STARTER_PACK], rng: seededRNG(attempt) });
      const mace = makeItemInstance('mace');
      const cleric = buildClericLevel6();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'blessed-strikes' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: mace },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: cleric,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: target,
        } satisfies CharacterCreatedEvent,
      ]);

      const levelEvents = engine.plan.levelUp(campaign.state, {
        characterId: cleric.id,
        classId: 'cleric',
        hpStrategy: 'average',
      }).events;
      campaign = commit(campaign, levelEvents);

      const blessedChoice = levelEvents.find(
        (e) => e.type === 'ChoiceRequired' && e.promptKey === 'cleric-blessed-strikes',
      ) as ChoiceRequiredEvent | undefined;
      expect(blessedChoice).toBeDefined();
      campaign = commit(
        campaign,
        engine.plan.resolveChoice(campaign.state, {
          choiceId: blessedChoice!.choiceId,
          characterId: cleric.id,
          selectedOptionIds: ['divine-strike'],
        }).events,
      );

      const attack = engine.plan.attack(campaign.state, {
        attackerId: cleric.id,
        targetId: target.id,
        weaponInstanceId: mace.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (attackRolled?.hit !== true) continue;

      const triggerFired = attack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('blessed-strikes-divine-strike'),
      );
      expect(triggerFired).toBeDefined();

      // A second attack the same turn does NOT fire the rider — the
      // OnEvent's `oncePer: 'turn'` cadence enforces the RAW limit.
      campaign = commit(campaign, attack);
      const secondAttack = engine.plan.attack(campaign.state, {
        attackerId: cleric.id,
        targetId: target.id,
        weaponInstanceId: mace.id,
      }).events;
      const secondAttackRolled = secondAttack.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (secondAttackRolled?.hit !== true) {
        // Miss reveals nothing; pick a new seed.
        proven = true;
        break;
      }
      const secondFire = secondAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('blessed-strikes-divine-strike'),
      );
      expect(secondFire).toBeUndefined();
      proven = true;
    }
    expect(proven, `Blessed Strikes Divine Strike did not fire across ${attempt} seeds`).toBe(true);
  });
});
