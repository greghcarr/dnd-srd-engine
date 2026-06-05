// Slice 667: Phantasmal Force wiring via the existing recurring-rider
// primitive.
//
// Composition (no new engine code): the existing `save` mechanic
// (slice 105+) + the existing `recurring` mechanic (slice 226+ with
// `effect: 'damage'`) already cover the spell's RAW shape:
//   1. INT save on cast; on fail, apply phantasmal-force-active.
//   2. Each turn the consumer calls planTickRecurring against the
//      same target, dealing 1d6 psychic damage. Auto-cleared on
//      concentration drop.
//
// What this audit pins:
//   1. On a failed INT save, the target gains phantasmal-force-active
//      (cast emits SaveRolled + ConditionApplied via the save
//      mechanic).
//   2. planTickRecurring against the target emits DamageApplied for
//      1d6 psychic.
//   3. Concentration drop sweeps the condition off the target.
//   4. On a successful INT save, no condition is applied.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const buildLowIntTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 6, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const buildHighIntTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wise One',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 20, hitDiceRemaining: 20 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 22, WIS: 22, CHA: 22 },
    hp: { current: 100, max: 100, temp: 0 },
  });

const seed = (
  caster: Character,
  target: Character,
  rngSeed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(rngSeed) });
  let campaign = engine.createCampaign({ name: 'phantasmal-force' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: caster,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: target,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

// Find a seed where the target FAILS the INT save (slice 667 happy
// path) for deterministic test execution.
const seedThatFailsSave = (
  caster: Character,
  target: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; cast: ReturnType<ReturnType<typeof createEngine>['plan']['castSpell']> } => {
  for (let s = 1; s <= 100; s += 1) {
    const ctx = seed(caster, target, s);
    const cast = ctx.engine.plan.castSpell(ctx.campaign.state, {
      characterId: caster.id,
      spellId: 'phantasmal-force',
      slotLevel: 2,
      targetIds: [target.id],
      ignorePreparation: true,
    });
    const save = cast.events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save !== undefined && save.success === false) {
      return { ...ctx, cast };
    }
  }
  throw new Error('No seed found where INT save fails');
};

describe('slice 667: Phantasmal Force (recurring-rider via existing save + recurring composition)', () => {
  it('on failed INT save: target gains phantasmal-force-active', () => {
    const wizard = buildWizard();
    const target = buildLowIntTarget();
    const ctx = seedThatFailsSave(wizard, target);
    const applied = ctx.cast.events.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied' &&
        e.conditionId === 'phantasmal-force-active' &&
        e.targetId === target.id,
    );
    expect(applied, 'phantasmal-force-active condition not applied on failed save').toBeDefined();
  });

  it('planTickRecurring against the convinced target emits DamageApplied for 1d6 psychic', () => {
    const wizard = buildWizard();
    const target = buildLowIntTarget();
    const ctx = seedThatFailsSave(wizard, target);
    const campaign = commit(ctx.campaign, ctx.cast.events);
    const tick = ctx.engine.plan.tickRecurring(campaign.state, {
      casterId: wizard.id,
      targetId: target.id,
    });
    const damage = tick.events.find(
      (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === target.id,
    );
    expect(damage, 'DamageApplied not emitted by planTickRecurring').toBeDefined();
    expect(damage!.components[0]!.type).toBe('psychic');
    expect(damage!.components[0]!.amount).toBeGreaterThanOrEqual(1);
    expect(damage!.components[0]!.amount).toBeLessThanOrEqual(6);
  });

  it('concentration drop sweeps phantasmal-force-active off the target', () => {
    const wizard = buildWizard();
    const target = buildLowIntTarget();
    const ctx = seedThatFailsSave(wizard, target);
    let campaign = commit(ctx.campaign, ctx.cast.events);
    expect(
      campaign.state.characters[target.id]!.appliedConditions.some(
        (c) => c.conditionId === 'phantasmal-force-active',
      ),
    ).toBe(true);
    const concId = campaign.state.characters[wizard.id]!.concentrationEffectId!;
    const broken: ConcentrationBrokenEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationBroken',
      effectInstanceId: concId,
      casterId: wizard.id,
      reason: 'voluntary',
    };
    campaign = commit(campaign, [broken]);
    expect(
      campaign.state.characters[target.id]!.appliedConditions.some(
        (c) => c.conditionId === 'phantasmal-force-active',
      ),
    ).toBe(false);
  });

  it('on successful INT save: no condition is applied', () => {
    const wizard = buildWizard();
    const target = buildHighIntTarget();
    // High-INT target almost always succeeds; iterate seeds defensively.
    for (let s = 1; s <= 50; s += 1) {
      const ctx = seed(wizard, target, s);
      const cast = ctx.engine.plan.castSpell(ctx.campaign.state, {
        characterId: wizard.id,
        spellId: 'phantasmal-force',
        slotLevel: 2,
        targetIds: [target.id],
        ignorePreparation: true,
      });
      const save = cast.events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save !== undefined && save.success === true) {
        const applied = cast.events.find(
          (e) => e.type === 'ConditionApplied' &&
            (e as ConditionAppliedEvent).conditionId === 'phantasmal-force-active',
        );
        expect(applied).toBeUndefined();
        return;
      }
    }
    throw new Error('No seed found where INT save succeeds');
  });
});
