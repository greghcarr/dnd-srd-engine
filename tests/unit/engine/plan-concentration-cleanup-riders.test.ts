// Slice 110 — concentration cleanup for rider-applied conditions.
//
// When an OnEvent rider lives inside a parent concentration effect
// (Spirit Shroud's heal-block, Holy Aura's blinded-on-attacker), the
// rider emits a ConditionApplied targeting a *different* creature than
// the bearer. Before this slice the rider-applied entry leaked across
// concentration end because EffectInstance.conditionsApplied only
// tracks the direct cast-time apply on the bearer.
//
// Fix: the dispatcher stamps `sourceEffectInstanceId` on rider-applied
// ConditionApplied events whenever the parent condition is itself
// tracked by an EffectInstance. clearConcentrationEffect then sweeps
// every character's appliedConditions for matching ids when
// concentration ends.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 42, max: 42, temp: 0 },
    featsTaken: [],
    preparedSpells: ['spirit-shroud'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Foe',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

interface SeededHit {
  readonly campaign: Campaign;
  readonly engine: ReturnType<typeof createEngine>;
  readonly casterId: string;
  readonly targetId: string;
  readonly heal: ConditionAppliedEvent;
  readonly effectInstanceId: string;
}

// Walks RNG seeds until Spirit Shroud's rider lands a heal-block on
// the target, returning the resulting campaign + event references.
// Mirrors the seed-walk pattern in plan-heal-blocked.test.ts.
const seedHealBlockedScene = (): SeededHit => {
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(seed) });
    const longsword = makeItemInstance('longsword');
    const caster = buildCleric();
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: `cleanup-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.castSpell(campaign.state, {
        characterId: caster.id,
        spellId: 'spirit-shroud',
        slotLevel: 3,
        targetIds: [caster.id],
        casterChoice: { kind: 'variant', value: 'cold' },
      }).events,
    );
    const effectInstanceId = campaign.state.characters[caster.id]!.concentrationEffectId;
    if (effectInstanceId === undefined) throw new Error('Spirit Shroud did not start concentration');

    const attackEvents = engine.plan.attack(campaign.state, {
      attackerId: caster.id,
      targetId: target.id,
      weaponInstanceId: longsword.id,
    }).events;
    const rolled = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit !== true) continue;
    const heal = attackEvents.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied'
        && (e as ConditionAppliedEvent).conditionId === 'healing-blocked-active',
    );
    if (heal === undefined) continue;
    campaign = commit(campaign, attackEvents);
    return { campaign, engine, casterId: caster.id, targetId: target.id, heal, effectInstanceId };
  }
  throw new Error('no seed produced a Spirit Shroud heal-block hit');
};

describe('concentration cleanup sweeps rider-applied conditions', () => {
  it("stamps sourceEffectInstanceId on the rider's ConditionApplied event", () => {
    const { heal, effectInstanceId } = seedHealBlockedScene();
    expect(heal.sourceEffectInstanceId).toBe(effectInstanceId);
  });

  it("the applied entry carries the parent effect instance id", () => {
    const { campaign, targetId, effectInstanceId } = seedHealBlockedScene();
    const entry = campaign.state.characters[targetId]!.appliedConditions.find(
      (c) => c.conditionId === 'healing-blocked-active',
    );
    expect(entry).toBeDefined();
    expect(entry!.sourceEffectInstanceId).toBe(effectInstanceId);
  });

  it('removes the rider-applied condition when concentration breaks', () => {
    const { campaign, casterId, targetId, effectInstanceId } = seedHealBlockedScene();
    expect(
      campaign.state.characters[targetId]!.appliedConditions.some(
        (c) => c.conditionId === 'healing-blocked-active',
      ),
    ).toBe(true);

    const dropped = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConcentrationBroken',
        effectInstanceId,
        casterId,
        reason: 'voluntary',
      },
    ]);

    expect(
      dropped.state.characters[targetId]!.appliedConditions.some(
        (c) => c.conditionId === 'healing-blocked-active',
      ),
    ).toBe(false);
    expect(dropped.state.effectInstances[effectInstanceId]).toBeUndefined();
  });

  it('non-concentration riders do not get a sourceEffectInstanceId stamp', () => {
    // Fighter Studied Attacks (slice 108) is a class-feature OnEvent
    // rider — it lives on the fighter directly, not inside a
    // concentration-tracked AppliedCondition. The dispatcher should
    // emit the rider's ConditionApplied with no sourceEffectInstanceId.
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const fighter = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Veteran',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 13, hitDiceRemaining: 13 }],
        abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 100, max: 100, temp: 0 },
        featsTaken: [],
      });
      const dummy = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `studied-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
      ]);
      const attackEvents = engine.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: dummy.id,
        weaponInstanceId: longsword.id,
      }).events;
      const rolled = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== false) continue;
      const studied = attackEvents.find(
        (e): e is ConditionAppliedEvent =>
          e.type === 'ConditionApplied'
          && (e as ConditionAppliedEvent).conditionId === 'studied-target-active',
      );
      expect(studied).toBeDefined();
      expect(studied!.sourceEffectInstanceId).toBeUndefined();
      return;
    }
    throw new Error('no seed produced a fighter miss for Studied Attacks rider test');
  });
});
