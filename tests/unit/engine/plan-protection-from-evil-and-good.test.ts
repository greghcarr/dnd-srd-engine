import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../../fixtures/index.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { resolveContent } from '../../../src/content/pack.js';
import { isImmuneToCondition } from '../../../src/derive/condition-immunity.js';

// Slice 103 — type-conditional buff / ward primitive (disadvantage arm).
// Slice 104 — source-predicate on GrantConditionImmunity (immunity arm).
//
// 1. EffectAccumulator's `imposesDisadvantageOnAttackers(attackerFacts)`
//    honors `condition` predicates on each ImposeDisadvantageOnAttackers
//    effect, evaluating them against the supplied attacker facts.
// 2. Protection from Evil and Good's `protection-from-evil-and-good-active`
//    condition carries a type-conditional ImposeDisadvantageOnAttackers
//    whose predicate matches six creature types (aberration, celestial,
//    elemental, fey, fiend, undead). Attacks from creatures outside the
//    six types resolve without the disadvantage.
// 3. The attack planner threads the attacker's creature type into the
//    accumulator query, so the end-to-end Skeleton-attacks-buffed-cleric
//    AttackRolled event uses disadvantage (two d20s).
// 4. EffectAccumulator's `hasConditionImmunity(id, sourceFacts)` honors
//    a `condition?: Predicate` on `GrantConditionImmunity`; PfEoG's
//    charmed / frightened arms gate on `sourceCreatureType` matching
//    the six warded types.
// 5. `isImmuneToCondition` accepts an optional `sourceCharacterId` and
//    builds `sourceCreatureType` facts from the source's record; the
//    three call sites (cast-spell save + buff branches, concentration
//    aura tick) thread it through.

const PACK = loadStarterPack();
const STARTER_CONTENT = resolveContent([PACK, loadPhbExtrasTestPack()]);

// Use the starter pack for monsters (Skeleton has the Undead type the
// PfEoG predicate matches). The TEST_PACK in tests/fixtures doesn't
// carry the skeleton statblock.

const longsword = (): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Warded Cleric',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    armorClass: 8, // low so the seed-hunt for a hit is short
    featsTaken: [],
  });

const buildSkeleton = (sword: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Skeleton',
    statblockId: 'skeleton',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 15, INT: 6, WIS: 8, CHA: 5 },
    hp: { current: 13, max: 13, temp: 0 },
    featsTaken: ['savage-attacker'],
    speedFeet: 30,
    inventory: [sword],
    equipped: { mainHand: sword, attuned: [] },
  });

const buildHumanoidAttacker = (sword: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bandit',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 11, max: 11, temp: 0 },
    featsTaken: ['savage-attacker'],
    inventory: [sword],
    equipped: { mainHand: sword, attuned: [] },
  });

describe('Protection from Evil and Good: predicate-gated ImposeDisadvantageOnAttackers', () => {
  it('imposesDisadvantageOnAttackers returns true when the attacker is one of the six warded types', () => {
    const cleric: Character = {
      ...buildCleric(),
      appliedConditions: [
        {
          id: newAppliedConditionId(),
          conditionId: 'protection-from-evil-and-good-active',
          sourceEventId: 'seed-event-id' as ReturnType<typeof newAppliedConditionId>,
        },
      ],
    };
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    for (const t of ['Aberration', 'Celestial', 'Elemental', 'Fey', 'Fiend', 'Undead'] as const) {
      const facts = new Map<string, unknown>([['attackerCreatureType', t]]);
      expect(stack.imposesDisadvantageOnAttackers(facts)).toBe(true);
    }
  });

  it('imposesDisadvantageOnAttackers returns false when the attacker is outside the warded types', () => {
    const cleric: Character = {
      ...buildCleric(),
      appliedConditions: [
        {
          id: newAppliedConditionId(),
          conditionId: 'protection-from-evil-and-good-active',
          sourceEventId: 'seed-event-id' as ReturnType<typeof newAppliedConditionId>,
        },
      ],
    };
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    for (const t of ['Humanoid', 'Beast', 'Construct', 'Dragon', 'Giant', 'Monstrosity', 'Ooze', 'Plant'] as const) {
      const facts = new Map<string, unknown>([['attackerCreatureType', t]]);
      expect(stack.imposesDisadvantageOnAttackers(facts)).toBe(false);
    }
  });

  it('imposesDisadvantageOnAttackers without facts returns false for an unconditional-free type-gated entry', () => {
    // PfEoG only carries the type-gated entry; with no facts supplied,
    // the predicate evaluation reads `undefined` for the path and the
    // `eq` terms all fail, so the result is false.
    const cleric: Character = {
      ...buildCleric(),
      appliedConditions: [
        {
          id: newAppliedConditionId(),
          conditionId: 'protection-from-evil-and-good-active',
          sourceEventId: 'seed-event-id' as ReturnType<typeof newAppliedConditionId>,
        },
      ],
    };
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    expect(stack.imposesDisadvantageOnAttackers()).toBe(false);
  });
});

describe('Attack planner: PfEoG-buffed target', () => {
  it('Skeleton attack against a PfEoG-buffed Cleric resolves with disadvantage', () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const sword = longsword();
      const cleric = buildCleric();
      const skeleton = buildSkeleton(sword.id);
      let campaign: Campaign = engine.createCampaign({ name: `pfeg-skel-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: skeleton } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConditionApplied',
          targetId: cleric.id,
          conditionId: 'protection-from-evil-and-good-active',
          appliedConditionId: newAppliedConditionId(),
        } satisfies ConditionAppliedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: skeleton.id,
        targetId: cleric.id,
        weaponInstanceId: sword.id,
      }).events;
      const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled === undefined) continue;
      expect(rolled.used).toBe('disadvantage');
      expect(rolled.d20.length).toBe(2);
      return;
    }
    throw new Error('no seed produced an AttackRolled for PfEoG vs Skeleton');
  });

  it('Bandit attack against a PfEoG-buffed Cleric resolves without disadvantage', () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const sword = longsword();
      const cleric = buildCleric();
      const bandit = buildHumanoidAttacker(sword.id);
      let campaign: Campaign = engine.createCampaign({ name: `pfeg-bandit-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bandit } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConditionApplied',
          targetId: cleric.id,
          conditionId: 'protection-from-evil-and-good-active',
          appliedConditionId: newAppliedConditionId(),
        } satisfies ConditionAppliedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: bandit.id,
        targetId: cleric.id,
        weaponInstanceId: sword.id,
      }).events;
      const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled === undefined) continue;
      expect(rolled.used).toBe('none');
      expect(rolled.d20.length).toBe(1);
      return;
    }
    throw new Error('no seed produced an AttackRolled for PfEoG vs Bandit');
  });
});

// Slice 104 — source-predicate on GrantConditionImmunity.

const buildPfEoGCleric = (): Character => ({
  ...buildCleric(),
  appliedConditions: [
    {
      id: newAppliedConditionId(),
      conditionId: 'protection-from-evil-and-good-active',
      sourceEventId: 'seed-event-id' as ReturnType<typeof newAppliedConditionId>,
    },
  ],
});

const buildSkeletonCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Skeleton Mage',
    statblockId: 'skeleton',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 14, CON: 15, INT: 16, WIS: 12, CHA: 6 },
    hp: { current: 30, max: 30, temp: 0 },
    featsTaken: [],
    preparedSpells: ['cause-fear'],
  });

const buildHumanoidCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cult Sorcerer',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'sorcerer', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 18 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: [],
    preparedSpells: ['cause-fear'],
  });

describe('Protection from Evil and Good: source-predicate condition immunity', () => {
  it('hasConditionImmunity returns true for charmed/frightened when the source is one of the six warded types', () => {
    const cleric = buildPfEoGCleric();
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    for (const t of ['Aberration', 'Celestial', 'Elemental', 'Fey', 'Fiend', 'Undead'] as const) {
      const facts = new Map<string, unknown>([['sourceCreatureType', t]]);
      expect(stack.hasConditionImmunity('charmed', facts)).toBe(true);
      expect(stack.hasConditionImmunity('frightened', facts)).toBe(true);
    }
  });

  it('hasConditionImmunity returns false for charmed/frightened when the source is outside the warded types', () => {
    const cleric = buildPfEoGCleric();
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    for (const t of ['Humanoid', 'Beast', 'Construct', 'Dragon', 'Giant'] as const) {
      const facts = new Map<string, unknown>([['sourceCreatureType', t]]);
      expect(stack.hasConditionImmunity('charmed', facts)).toBe(false);
      expect(stack.hasConditionImmunity('frightened', facts)).toBe(false);
    }
  });

  it('hasConditionImmunity returns false for non-warded conditions regardless of source type', () => {
    const cleric = buildPfEoGCleric();
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    const facts = new Map<string, unknown>([['sourceCreatureType', 'Fiend']]);
    expect(stack.hasConditionImmunity('paralyzed', facts)).toBe(false);
    expect(stack.hasConditionImmunity('poisoned', facts)).toBe(false);
  });

  it('hasConditionImmunity returns false when no source facts are supplied (predicate-gated entries drop)', () => {
    const cleric = buildPfEoGCleric();
    const stack = buildEffectStack({
      character: cleric,
      content: STARTER_CONTENT,
      itemInstances: {},
      pendingChoices: {},
    });
    expect(stack.hasConditionImmunity('charmed')).toBe(false);
    expect(stack.hasConditionImmunity('frightened')).toBe(false);
  });

  it('isImmuneToCondition resolves source-gated immunity via sourceCharacterId', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const cleric = buildPfEoGCleric();
    const undead = buildSkeletonCaster();
    const humanoid = buildHumanoidCaster();
    let campaign: Campaign = engine.createCampaign({ name: 'pfeg-immune' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: undead } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: humanoid } satisfies CharacterCreatedEvent,
    ]);
    // Undead source → cleric is immune to frightened.
    expect(
      isImmuneToCondition({
        state: campaign.state,
        content: STARTER_CONTENT,
        targetId: cleric.id,
        conditionId: 'frightened',
        sourceCharacterId: undead.id,
      }),
    ).toBe(true);
    // Humanoid source → cleric is not immune.
    expect(
      isImmuneToCondition({
        state: campaign.state,
        content: STARTER_CONTENT,
        targetId: cleric.id,
        conditionId: 'frightened',
        sourceCharacterId: humanoid.id,
      }),
    ).toBe(false);
    // No source → predicate-gated immunity drops.
    expect(
      isImmuneToCondition({
        state: campaign.state,
        content: STARTER_CONTENT,
        targetId: cleric.id,
        conditionId: 'frightened',
      }),
    ).toBe(false);
  });

  it('cast-spell skips ConditionApplied(frightened) when an Undead source casts Cause Fear at a PfEoG cleric (failed save)', () => {
    // Walk seeds until the cleric fails the WIS save against Cause Fear.
    // On failure, normally the planner emits ConditionApplied(frightened);
    // with source-gated immunity, the planner sees the source is Undead
    // and skips the apply.
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const cleric = buildPfEoGCleric();
      const undead = buildSkeletonCaster();
      let campaign: Campaign = engine.createCampaign({ name: `pfeg-cause-fear-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: undead } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: undead.id,
        spellId: 'cause-fear',
        slotLevel: 1,
        targetIds: [cleric.id],
      }).events;
      const saveEvent = events.find((e) => e.type === 'SaveRolled');
      if (saveEvent === undefined || saveEvent.type !== 'SaveRolled') continue;
      if (saveEvent.success) continue; // we need a failed save to exercise the immunity branch
      const applied = events.find(
        (e): e is ConditionAppliedEvent =>
          e.type === 'ConditionApplied'
          && (e as ConditionAppliedEvent).conditionId === 'frightened',
      );
      expect(applied).toBeUndefined();
      return;
    }
    throw new Error('no seed produced a failed save for PfEoG vs Undead Cause Fear');
  });

  it('cast-spell still emits ConditionApplied(frightened) when a Humanoid source casts Cause Fear at a PfEoG cleric (failed save)', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const cleric = buildPfEoGCleric();
      const humanoid = buildHumanoidCaster();
      let campaign: Campaign = engine.createCampaign({ name: `pfeg-humanoid-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: humanoid } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: humanoid.id,
        spellId: 'cause-fear',
        slotLevel: 1,
        targetIds: [cleric.id],
      }).events;
      const saveEvent = events.find((e) => e.type === 'SaveRolled');
      if (saveEvent === undefined || saveEvent.type !== 'SaveRolled') continue;
      if (saveEvent.success) continue;
      const applied = events.find(
        (e): e is ConditionAppliedEvent =>
          e.type === 'ConditionApplied'
          && (e as ConditionAppliedEvent).conditionId === 'frightened',
      );
      expect(applied).toBeDefined();
      return;
    }
    throw new Error('no seed produced a failed save for PfEoG vs Humanoid Cause Fear');
  });
});
