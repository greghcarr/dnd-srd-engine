// Slice 563: Vicious Mockery disadvantage-on-next-attack rider.
//
// RAW (SRD 5.2.1 Vicious Mockery): "Constitution Saving Throw...
// Failure: 1d6 Psychic damage, and the target has Disadvantage on
// the next attack roll it makes before the end of its next turn."
//
// Wait — re-read. The 2024 SRD says WISDOM save:
// "Wisdom Saving Throw: 1d6 Psychic damage. The target has
// Disadvantage on the next attack roll it makes before the end of
// its next turn."
//
// Pre-slice the engine cast Vicious Mockery and applied damage on a
// failed save, but the disadvantage rider was absent. This slice adds
// a `viciously-mocked` condition (consumeOnAttack + autoExpiry
// turnEnd) and wires Vicious Mockery's save mechanic to apply it.
//
// The autoExpiry's "end of its next turn" semantic requires the
// condition's `sourceCharacterId` to be the BEARER (the mocked
// target), not the caster — so the slice also adds a save-mechanic
// option `applyConditionSourceFromTarget: true` that flips the
// source from caster to target on the ConditionApplied event.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildBard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Scanlan',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'bard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 12, WIS: 10, CHA: 18 },
    hp: { current: 9, max: 9, temp: 0 },
    knownSpells: ['vicious-mockery'],
  });

const buildTarget = (weaponInstanceId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 8, CHA: 10 }, // low WIS to fail save
    hp: { current: 30, max: 30, temp: 0 },
    ...(weaponInstanceId !== undefined
      ? { equipped: { mainHand: weaponInstanceId }, inventory: [weaponInstanceId] }
      : {}),
  });

const setup = (engine: ReturnType<typeof createEngine>, bard: Character, target: Character, items: ReturnType<typeof makeItemInstance>[] = []) => {
  let campaign = engine.createCampaign({ name: 'vm' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ...items.map<ItemAcquiredEvent>((i) => ({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: i })),
  ]);
  return campaign;
};

// Force a failed save by iterating seeds until one produces a fail.
const findFailingCast = (
  campaign: ReturnType<ReturnType<typeof createEngine>['createCampaign']>,
  bardId: string,
  targetId: string,
) => {
  for (let seed = 1; seed < 80; seed++) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: bardId, spellId: 'vicious-mockery', slotLevel: 0, targetIds: [targetId],
    });
    const condApplied = events.find(
      (e) => (e as { type: string }).type === 'ConditionApplied'
        && (e as { conditionId?: string }).conditionId === 'viciously-mocked',
    ) as ConditionAppliedEvent | undefined;
    if (condApplied) return { events, condApplied };
  }
  return undefined;
};

describe('Vicious Mockery disadvantage rider (slice 563)', () => {
  describe('pack declaration', () => {
    it('viciously-mocked condition ships with consumeOnAttack + autoExpiry turnEnd + disadvantage on attack', () => {
      const cond = PACK.conditions?.find((c) => c.id === 'viciously-mocked');
      expect(cond).toBeDefined();
      expect(cond?.consumeOnAttack).toBe(true);
      expect(cond?.autoExpiry?.afterRounds).toBe(1);
      expect(cond?.autoExpiry?.trigger).toBe('turnEnd');
      const setAdv = cond?.effects.find((e) => e.kind === 'SetAdvantage') as { on: string; mode: string } | undefined;
      expect(setAdv).toBeDefined();
      expect(setAdv!.on).toBe('attack');
      expect(setAdv!.mode).toBe('disadvantage');
    });

    it('Vicious Mockery spell has conditionOnFail + applyConditionSourceFromTarget wiring', () => {
      const vm = PACK.spells?.find((s) => s.id === 'vicious-mockery');
      expect(vm).toBeDefined();
      const save = vm!.mechanicalEffects?.find((e) => e.kind === 'save') as
        | { conditionOnFail?: string; applyConditionSourceFromTarget?: boolean }
        | undefined;
      expect(save).toBeDefined();
      expect(save!.conditionOnFail).toBe('viciously-mocked');
      expect(save!.applyConditionSourceFromTarget).toBe(true);
    });
  });

  describe('failed save applies viciously-mocked', () => {
    it('failed save: ConditionApplied(viciously-mocked) emitted with sourceCharacterId = TARGET (not caster)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const bard = buildBard();
      const target = buildTarget();
      const campaign = setup(engine, bard, target);
      const result = findFailingCast(campaign, bard.id, target.id);
      expect(result).toBeDefined();
      // Source is the target (for autoExpiry "end of its next turn")
      expect(result!.condApplied.sourceCharacterId).toBe(target.id);
      // Bearer is the target
      expect(result!.condApplied.targetId).toBe(target.id);
    });

    it('viciously-mocked applied via failed save imposes disadvantage on the target\'s next attack', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const bard = buildBard();
      const sword = makeItemInstance('longsword');
      const target = buildTarget(sword.id);
      let campaign = setup(engine, bard, target, [sword]);
      const result = findFailingCast(campaign, bard.id, target.id);
      expect(result).toBeDefined();
      campaign = commit(campaign, result!.events);
      // Now target attacks the bard — should roll with disadvantage
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: target.id, targetId: bard.id, weaponInstanceId: sword.id,
      });
      const attack = events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(attack?.used).toBe('disadvantage');
    });

    it('viciously-mocked is consumed after the first attack (RAW: "next attack roll")', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const bard = buildBard();
      const sword = makeItemInstance('longsword');
      const target = buildTarget(sword.id);
      let campaign = setup(engine, bard, target, [sword]);
      const result = findFailingCast(campaign, bard.id, target.id);
      expect(result).toBeDefined();
      campaign = commit(campaign, result!.events);
      // First attack — should be disadvantage
      const first = engine.plan.attack(campaign.state, {
        attackerId: target.id, targetId: bard.id, weaponInstanceId: sword.id,
      });
      campaign = commit(campaign, first.events);
      // Condition should now be removed
      const conds = campaign.state.characters[target.id]!.appliedConditions;
      expect(conds.some((c) => c.conditionId === 'viciously-mocked')).toBe(false);
      // Second attack — no disadvantage
      const second = engine.plan.attack(campaign.state, {
        attackerId: target.id, targetId: bard.id, weaponInstanceId: sword.id,
      });
      const secondAttack = second.events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(secondAttack?.used).toBe('none');
    });
  });
});
