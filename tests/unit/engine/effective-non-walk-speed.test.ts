// Slice 288 — non-walk speed derives: getEffectiveFlySpeed,
// getEffectiveSwimSpeed, getEffectiveClimbSpeed,
// getEffectiveBurrowSpeed.
//
// Slice 263's pattern-check finding documented that ~30 ModifySpeed
// entries for non-walk modes (fly / swim / climb / burrow) projected
// to the effect stack but no consumer read them. This slice ships
// the four mirror derives. Algorithm matches getEffectiveSpeed: base
// from species / statblock + add / set / multiply effect entries.
//
// Multiple in-pack wires now project mechanically:
// - Cloak of the Bat fly 40 (slice 227 row half b; still pending the
//   Toggle wire that lights it up at all).
// - Gaseous Form fly 10 (slice 287 declarative wire — this slice
//   flips it from "declarative" to "actually surfaces").
// - Gloves of Swimming and Climbing climb 30 / swim 30 (slice 132).
// - Slippers of Spider Climbing climb 30 (slice 227 approximation).
// - Ring of Swimming swim 40 (slice 132).
// - Spider Climb spell condition climb=30 (slice 77 / slice 73).
// - Native monster fly / climb speeds (Young Red Dragon fly 80
//   climb 40, etc.).

import { describe, expect, it } from 'vitest';
import { commit } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import {
  getEffectiveBurrowSpeed,
  getEffectiveClimbSpeed,
  getEffectiveFlySpeed,
  getEffectiveSpeed,
  getEffectiveSwimSpeed,
} from '../../../src/engine/plan/_actor-state.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import {
  newAppliedConditionId,
  newCharacterId,
  newItemInstanceId,
} from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// Slice 304: the "zero-set wins" case below used to lean on the
// `earthbound-active` condition (fly set 0), a dead 2014-era orphan
// removed from the shipped pack in slice 304. The behavior it
// exercises (a ModifySpeed `set 0` overriding a non-walk speed
// source) is still worth pinning, so the fly-set-0 fixture now lives
// in a test-local pack rather than in the consumer-facing content.
const FLY_GROUNDED_FIXTURE = 'test-fly-grounded-fixture';
const FIXTURE_PACK = (() => {
  const p = loadStarterPack();
  p.conditions.push({
    id: FLY_GROUNDED_FIXTURE,
    name: 'Test Fixture: Fly Grounded',
    stackable: false,
    endsOn: [],
    effects: [{ kind: 'ModifySpeed', mode: 'fly', op: 'set', value: 0 }],
  });
  return p;
})();
const FIXTURE_CONTENT = resolveContent([FIXTURE_PACK]);

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const applyCondition = (targetId: string, conditionId: string) => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ConditionApplied' as const,
  targetId: targetId as never,
  conditionId,
  appliedConditionId: newAppliedConditionId(),
});

const seed = (character: Character, conditions: string[] = [], pack = PACK) => {
  const engine = createEngine({ contentPacks: [pack], rng: seededRNG(288) });
  let campaign = engine.createCampaign({ name: 'non-walk' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
    ...conditions.map((c) => applyCondition(character.id, c)),
  ]);
  return campaign.state.characters[character.id]!;
};

const speedInput = (character: Character, itemInstances: Readonly<Record<string, ItemInstance>> = {}) => ({
  character,
  content: CONTENT,
  itemInstances,
});

describe('slice 288: non-walk speed derives', () => {
  describe('PC base (human, no native non-walk speed, no effects)', () => {
    it('fly / swim / climb / burrow all default to 0', () => {
      const human = seed(buildHuman());
      expect(getEffectiveFlySpeed(speedInput(human))).toBe(0);
      expect(getEffectiveSwimSpeed(speedInput(human))).toBe(0);
      expect(getEffectiveClimbSpeed(speedInput(human))).toBe(0);
      expect(getEffectiveBurrowSpeed(speedInput(human))).toBe(0);
    });
  });

  describe('condition-applied fly speed (Gaseous Form)', () => {
    it('a creature with gaseous-form-active has fly speed 10', () => {
      const human = seed(buildHuman(), ['gaseous-form-active']);
      expect(getEffectiveFlySpeed(speedInput(human))).toBe(10);
    });
  });

  describe('condition-applied climb speed (Spider Climb)', () => {
    it('a creature with spider-climbing-active gains climb speed 30', () => {
      const human = seed(buildHuman(), ['spider-climbing-active']);
      expect(getEffectiveClimbSpeed(speedInput(human))).toBe(30);
    });
  });

  describe('item-projected speeds (slice 132 magic-item projection)', () => {
    it('Ring of Swimming projects swim 40 from inventory (no attunement)', () => {
      const ring = ItemInstanceSchema.parse({
        id: newItemInstanceId(),
        definitionId: 'ring-of-swimming',
      });
      const human = seed({ ...buildHuman(), inventory: [ring.id] });
      expect(getEffectiveSwimSpeed(speedInput(human, { [ring.id]: ring }))).toBe(40);
    });

    it('Gloves of Swimming and Climbing (attuned) projects climb 30 and swim 30', () => {
      const gloves = ItemInstanceSchema.parse({
        id: newItemInstanceId(),
        definitionId: 'gloves-of-swimming-and-climbing',
      });
      const human = seed({
        ...buildHuman(),
        inventory: [gloves.id],
        equipped: { attuned: [gloves.id] as never },
      });
      expect(getEffectiveClimbSpeed(speedInput(human, { [gloves.id]: gloves }))).toBe(30);
      expect(getEffectiveSwimSpeed(speedInput(human, { [gloves.id]: gloves }))).toBe(30);
    });
  });

  describe('monster native speeds', () => {
    it('Young Red Dragon statblock projects fly 80 and climb 40', () => {
      const dragon = CharacterSchema.parse({
        id: newCharacterId(),
        kind: 'creature',
        name: 'Young Red Dragon',
        speciesId: 'human',
        backgroundId: 'soldier',
        statblockId: 'young-red-dragon',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 23, DEX: 10, CON: 21, INT: 14, WIS: 11, CHA: 19 },
        hp: { current: 178, max: 178, temp: 0 },
        speedFeet: 40,
      });
      const seeded = seed(dragon);
      expect(getEffectiveFlySpeed(speedInput(seeded))).toBe(80);
      expect(getEffectiveClimbSpeed(speedInput(seeded))).toBe(40);
      expect(getEffectiveSwimSpeed(speedInput(seeded))).toBe(0);
      expect(getEffectiveBurrowSpeed(speedInput(seeded))).toBe(0);
    });
  });

  describe('zero-speed wins (ModifySpeed set 0 overrides everything)', () => {
    it('a fly-speed source plus a fly-set-0 source resolves to 0', () => {
      // Gaseous Form sets fly 10; the test-local fly-grounded fixture
      // sets fly 0. The zero-set takes precedence regardless of order.
      const human = seed(
        buildHuman(),
        ['gaseous-form-active', FLY_GROUNDED_FIXTURE],
        FIXTURE_PACK,
      );
      expect(getEffectiveFlySpeed({ character: human, content: FIXTURE_CONTENT, itemInstances: {} })).toBe(0);
    });
  });

  describe('walk speed unchanged (regression check)', () => {
    it('non-walk derives do not affect the slice-77 walk derive', () => {
      // Sanity: walk speed reads from the same effect stack but for a
      // different mode. Adding non-walk derives must not regress
      // walk-side behavior.
      const human = seed(buildHuman(), ['gaseous-form-active']);
      // Gaseous Form has no ModifySpeed walk entry, so walk stays at
      // the human species default (30). (Slice 427: walk derives from the
      // species when speedFeet is unset, so assert the effective speed.)
      expect(getEffectiveSpeed({ character: human, content: FIXTURE_CONTENT, itemInstances: {} })).toBe(30);
    });
  });
});
