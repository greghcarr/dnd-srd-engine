// Golden scenario: Divine Smite (slice 444).
//
// Divine Smite is the canonical user for the on-hit smite-rider via
// `castSpell`: cast as a Bonus Action (Range: Self), the buff condition
// `divine-smite-active` carries two `OnEvent` riders that fire on the
// caster's next melee weapon hit. The base rider deals 2d8 radiant
// unconditionally; the "celestial" rider deals an additional 1d8 radiant
// gated on `event.targetCreatureType IN {Fiend, Undead}`. Both have
// `consumeOnTrigger: true`; per the dispatcher's snapshot-then-iterate
// design (slice 114), both riders fire on the same AttackRolled before
// the first rider's consume removes the condition from the snapshot.
//
// The two test variants prove the gate:
//   1. Target is a Skeleton (Undead) -> both riders fire (+3d8 radiant).
//   2. Target is a non-Fiend/non-Undead -> only the base rider fires
//      (+2d8 radiant), and the celestial rider does not fire.
//
// In both cases the bearing condition is consumed after the hit, and a
// subsequent attack does not re-trigger either rider.
//
// RAW deviations documented in slice 444 (not exercised here):
//   - Upcast scaling (+1d8 per slot above L1) is not yet wired; the
//     buff mechanic doesn't carry slot-level-aware variants. Only L1
//     paladins are unaffected; L3+ paladins lose +1d8/+2d8/+3d8 upcast.
//   - The "Melee weapon or Unarmed Strike" restriction is gated via
//     `event.attackKind == 'melee'`. Unarmed strikes already classify
//     as melee in the engine, so both routes fire correctly.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';

const buildPaladin = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ariadne',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 22, max: 22, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: ['divine-smite'],
  });

const buildHumanoidTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bandit',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

describe('golden: Divine Smite (on-hit smite-rider via castSpell, slice 444)', () => {
  it('Hit against a Humanoid: only the base rider fires, condition is consumed', () => {
    const STARTER_PACK = loadStarterPack();
    let attempt = 0;
    let proven = false;
    while (attempt < 100 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [STARTER_PACK], rng: seededRNG(attempt) });
      const longsword = makeItemInstance('longsword');
      const paladin = buildPaladin();
      const target = buildHumanoidTarget();
      let campaign = engine.createCampaign({ name: 'divine-smite-humanoid' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
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
          snapshot: target,
        } satisfies CharacterCreatedEvent,
      ]);

      const castEvents = engine.plan.castSpell(campaign.state, {
        characterId: paladin.id,
        spellId: 'divine-smite',
        slotLevel: 1,
        targetIds: [paladin.id],
      }).events;
      campaign = commit(campaign, castEvents);

      expect(
        campaign.state.characters[paladin.id]?.appliedConditions.some(
          (c) => c.conditionId === 'divine-smite-active',
        ),
      ).toBe(true);

      const firstAttack = engine.plan.attack(campaign.state, {
        attackerId: paladin.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const firstHit = firstAttack.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (firstHit?.hit !== true) continue;

      const baseFire = firstAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('divine-smite-base-rider'),
      );
      expect(baseFire).toBeDefined();
      const celestialFire = firstAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('divine-smite-celestial-rider'),
      );
      expect(celestialFire).toBeUndefined();

      campaign = commit(campaign, firstAttack);

      expect(
        campaign.state.characters[paladin.id]?.appliedConditions.some(
          (c) => c.conditionId === 'divine-smite-active',
        ),
      ).toBe(false);

      const secondAttack = engine.plan.attack(campaign.state, {
        attackerId: paladin.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const secondFire = secondAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.startsWith(`${paladin.id}::divine-smite`),
      );
      expect(secondFire).toBeUndefined();

      proven = true;
    }
    expect(proven, `Divine Smite vs Humanoid: no hit across ${attempt} seeds`).toBe(true);
  });

  it('Hit against an Undead: both base and celestial riders fire, condition is consumed', () => {
    const STARTER_PACK = loadStarterPack();
    let attempt = 0;
    let proven = false;
    while (attempt < 100 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [STARTER_PACK], rng: seededRNG(attempt + 400) });
      const longsword = makeItemInstance('longsword');
      const paladin = buildPaladin();
      const skeleton: Character = CharacterSchema.parse({
        id: newCharacterId(),
        kind: 'creature',
        name: 'Skeleton',
        speciesId: 'companion',
        backgroundId: 'companion',
        statblockId: 'skeleton',
        classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 14, CON: 15, INT: 6, WIS: 8, CHA: 5 },
        hp: { current: 13, max: 13, temp: 0 },
      });
      let campaign = engine.createCampaign({ name: 'divine-smite-undead' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
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
          snapshot: skeleton,
        } satisfies CharacterCreatedEvent,
      ]);

      const castEvents = engine.plan.castSpell(campaign.state, {
        characterId: paladin.id,
        spellId: 'divine-smite',
        slotLevel: 1,
        targetIds: [paladin.id],
      }).events;
      campaign = commit(campaign, castEvents);

      const firstAttack = engine.plan.attack(campaign.state, {
        attackerId: paladin.id,
        targetId: skeleton.id,
        weaponInstanceId: longsword.id,
      }).events;
      const firstHit = firstAttack.find((e) => e.type === 'AttackRolled') as
        | AttackRolledEvent
        | undefined;
      if (firstHit?.hit !== true) continue;

      const baseFire = firstAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('divine-smite-base-rider'),
      );
      expect(baseFire).toBeDefined();
      const celestialFire = firstAttack.find(
        (e) => e.type === 'TriggerFired' && e.triggerId.endsWith('divine-smite-celestial-rider'),
      );
      expect(celestialFire).toBeDefined();

      campaign = commit(campaign, firstAttack);

      expect(
        campaign.state.characters[paladin.id]?.appliedConditions.some(
          (c) => c.conditionId === 'divine-smite-active',
        ),
      ).toBe(false);

      proven = true;
    }
    expect(proven, `Divine Smite vs Undead: no hit across ${attempt} seeds`).toBe(true);
  });
});
