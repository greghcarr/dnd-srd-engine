// Slice 670: Slow wiring.
//
// Composition (no new engine code): existing `save` mechanic with
// conditionOnFail applies the new composite condition. The
// condition projects the most mechanically load-bearing arms
// (walking speed halved, AC -2, DEX saves -2). The remaining RAW
// arms (no reactions, one-action-OR-one-bonus restriction,
// max-one-attack, spellcasting 50% gate) stay consumer-managed —
// the condition is the contract for those.
//
// What this audit pins:
//   1. Cast emits a SaveRolled for each target; failed targets get
//      slowed-by-spell-active.
//   2. The condition's effects array carries ModifySpeed walk *0.5,
//      AC -2, and a DEX-save -2 AddModifier.
//   3. Concentration drop sweeps the condition.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
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

const buildLowWisTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 6, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const seedThatFailsSave = (
  caster: Character,
  target: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; cast: ReturnType<ReturnType<typeof createEngine>['plan']['castSpell']> } => {
  for (let s = 1; s <= 100; s += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(s) });
    let campaign = engine.createCampaign({ name: `slow-${s}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'slow',
      slotLevel: 3,
      targetIds: [target.id],
      ignorePreparation: true,
    });
    const save = cast.events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save !== undefined && save.success === false) {
      return { engine, campaign, cast };
    }
  }
  throw new Error('No seed found where WIS save fails');
};

describe('slice 670: Slow (composite condition via save + conditionOnFail)', () => {
  it('cast: on failed WIS save, target gains slowed-by-spell-active', () => {
    const caster = buildWizard();
    const target = buildLowWisTarget();
    const ctx = seedThatFailsSave(caster, target);
    const applied = ctx.cast.events.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied' && e.conditionId === 'slowed-by-spell-active' && e.targetId === target.id,
    );
    expect(applied).toBeDefined();
  });

  it('slowed-by-spell-active definition: walk speed half + AC -2 + DEX save -2', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'slowed-by-spell-active');
    expect(condition).toBeDefined();
    const ms = condition!.effects.find((e) => e.kind === 'ModifySpeed') as
      | { mode: string; op: string; value: number }
      | undefined;
    expect(ms).toBeDefined();
    expect(ms!.mode).toBe('walk');
    expect(ms!.op).toBe('multiply');
    expect(ms!.value).toBe(0.5);

    const acMod = condition!.effects.find(
      (e) => e.kind === 'AddModifier' && (e as { target: unknown }).target === 'ac',
    ) as { value: number } | undefined;
    expect(acMod).toBeDefined();
    expect(acMod!.value).toBe(-2);

    const saveMod = condition!.effects.find(
      (e) =>
        e.kind === 'AddModifier' &&
        typeof (e as { target: unknown }).target === 'object' &&
        ((e as { target: { kind: string; ability: string } }).target.kind === 'save') &&
        ((e as { target: { kind: string; ability: string } }).target.ability === 'DEX'),
    ) as { value: number } | undefined;
    expect(saveMod).toBeDefined();
    expect(saveMod!.value).toBe(-2);
  });

  it('concentration drop sweeps the slowed-by-spell-active condition', () => {
    const caster = buildWizard();
    const target = buildLowWisTarget();
    const ctx = seedThatFailsSave(caster, target);
    let campaign = commit(ctx.campaign, ctx.cast.events);
    expect(
      campaign.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'slowed-by-spell-active'),
    ).toBe(true);
    const concId = campaign.state.characters[caster.id]!.concentrationEffectId!;
    const broken: ConcentrationBrokenEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationBroken',
      effectInstanceId: concId,
      casterId: caster.id,
      reason: 'voluntary',
    };
    campaign = commit(campaign, [broken]);
    expect(
      campaign.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'slowed-by-spell-active'),
    ).toBe(false);
  });
});
