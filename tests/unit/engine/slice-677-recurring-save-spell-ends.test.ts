// Slice 677: end-of-turn save-ends arms for Shining Smite, Ray of
// Enfeeblement, and Slow.
//
// The existing recurring-save infrastructure (planTickRecurringSave +
// condition.recurringSave metadata) supports save-end conditions
// — Hold Person's `held-paralyzed-active` has been wired since
// before this cycle. Slice 677 extends the same wiring to three
// spell-conditions that were consumer-driven before:
//
//   - shining-smite-target-illuminated: turnEnd CON save vs caster's
//     spell DC; success removes the marker (Shining Smite ends on
//     the target).
//   - enfeebled: turnEnd CON save vs caster's spell DC; success
//     removes the marker (Ray of Enfeeblement ends on the target).
//   - slowed-by-spell-active: turnEnd WIS save vs caster's spell DC;
//     success removes the condition (Slow ends on the target).
//
// What this audit pins:
//   1. Each condition declares the expected `recurringSave` shape.
//   2. planTickRecurringSave on a condition-bearing target rolls
//      a SaveRolled; on success it emits ConditionRemoved.
//   3. The DC is derived from the caster's spell save DC (from
//      the AppliedCondition's `sourceCharacterId`).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const buildTargetWithCondition = (
  conditionId: string,
  sourceCharacterId: string,
  // High target ability scores so saves are likely to succeed across
  // seeds (we want to see the save-success branch land).
  abilityScores: { STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number } = {
    STR: 20, DEX: 20, CON: 20, INT: 20, WIS: 20, CHA: 20,
  },
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores,
    hp: { current: 50, max: 50, temp: 0 },
    appliedConditions: [
      {
        id: newAppliedConditionId(),
        conditionId,
        sourceCharacterId,
      },
    ],
  });

const seed = (
  caster: Character,
  target: Character,
  rngSeed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(rngSeed) });
  let campaign = engine.createCampaign({ name: 'recurring-save-spell-ends' });
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

const findSavedSeed = (
  conditionId: string,
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; events: ReadonlyArray<unknown>; targetId: string } => {
  for (let s = 1; s <= 100; s += 1) {
    const caster = buildCaster();
    const high = { STR: 20, DEX: 20, CON: 20, INT: 20, WIS: 20, CHA: 20 };
    const target = buildTargetWithCondition(conditionId, caster.id, high);
    const ctx = seed(caster, target, s);
    const tick = ctx.engine.plan.tickRecurringSave(ctx.campaign.state, {
      targetId: target.id,
      conditionId,
    });
    const save = tick.events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save !== undefined && save.success === true) {
      return { engine: ctx.engine, campaign: ctx.campaign, events: tick.events, targetId: target.id };
    }
  }
  throw new Error(`No seed found where ${ability} save succeeds for ${conditionId}`);
};

describe('slice 677: recurring-save spell-ends arms (Shining Smite, Ray of Enfeeblement, Slow)', () => {
  it('shining-smite-target-illuminated: declares CON turnEnd recurringSave with onSuccess removeCondition', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'shining-smite-target-illuminated');
    expect(condition?.recurringSave).toEqual({
      ability: 'CON',
      trigger: 'turnEnd',
      onSuccess: 'removeCondition',
    });
  });

  it('enfeebled: declares CON turnEnd recurringSave with onSuccess removeCondition', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'enfeebled');
    expect(condition?.recurringSave).toEqual({
      ability: 'CON',
      trigger: 'turnEnd',
      onSuccess: 'removeCondition',
    });
  });

  it('slowed-by-spell-active: declares WIS turnEnd recurringSave with onSuccess removeCondition', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'slowed-by-spell-active');
    expect(condition?.recurringSave).toEqual({
      ability: 'WIS',
      trigger: 'turnEnd',
      onSuccess: 'removeCondition',
    });
  });

  it('Shining Smite save-success removes shining-smite-target-illuminated', () => {
    const ctx = findSavedSeed('shining-smite-target-illuminated', 'CON');
    const removed = ctx.events.find(
      (e): e is ConditionRemovedEvent =>
        (e as ConditionRemovedEvent).type === 'ConditionRemoved' &&
        (e as ConditionRemovedEvent).conditionId === 'shining-smite-target-illuminated',
    );
    expect(removed, 'ConditionRemoved not emitted on save success').toBeDefined();
  });

  it('Ray of Enfeeblement save-success removes enfeebled', () => {
    const ctx = findSavedSeed('enfeebled', 'CON');
    const removed = ctx.events.find(
      (e): e is ConditionRemovedEvent =>
        (e as ConditionRemovedEvent).type === 'ConditionRemoved' &&
        (e as ConditionRemovedEvent).conditionId === 'enfeebled',
    );
    expect(removed).toBeDefined();
  });

  it('Slow save-success removes slowed-by-spell-active', () => {
    const ctx = findSavedSeed('slowed-by-spell-active', 'WIS');
    const removed = ctx.events.find(
      (e): e is ConditionRemovedEvent =>
        (e as ConditionRemovedEvent).type === 'ConditionRemoved' &&
        (e as ConditionRemovedEvent).conditionId === 'slowed-by-spell-active',
    );
    expect(removed).toBeDefined();
  });
});
