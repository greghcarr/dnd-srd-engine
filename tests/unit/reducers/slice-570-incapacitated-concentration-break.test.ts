// Slice 570: Becoming Incapacitated ends Concentration.
//
// RAW (PHB 2024 ch.7 Concentration): "Your Concentration ends if you
// become Incapacitated or die."
//
// Pre-slice the engine cleared concentration in two places:
//   1. HP-drop-to-0 in applyDamageApplied (combat.ts:104-117) —
//      handles falling Unconscious from damage.
//   2. Planners that explicitly emit ConcentrationBroken events
//      (planConcentrationBreakOnDrop, etc.).
//
// Neither path triggers when a Concentration-holding caster receives
// an Incapacitated-composing condition (Hold Person → paralyzed,
// Power Word Stun → power-word-stunned-active, Hideous Laughter →
// hideous-laughter-active, plain Incapacitated, Stunned, Paralyzed,
// Petrified, Unconscious applied by a non-damage source).
//
// Slice 570 hooks applyConditionApplied: when the applied condition's
// id is in the INCAPACITATING_CONDITIONS set (mirror of
// ACTION_BLOCKING_CONDITIONS in src/engine/plan/_actor-state.ts), the
// character's existing Concentration is cleared via the existing
// clearConcentrationEffect helper.

import { describe, expect, it } from 'vitest';
import { applyConditionApplied } from '../../../src/engine/reducers/combat.js';
import { CampaignStateSchema, type CampaignState } from '../../../src/schemas/runtime/campaign.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId, newEffectInstanceId, newEventId } from '../../../src/ids.js';
import { produce } from 'immer';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const buildCaster = (concentrationEffectId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    ...(concentrationEffectId !== undefined ? { concentrationEffectId } : {}),
  });

const buildState = (caster: Character, effectInstanceId?: string): CampaignState => {
  const base: Record<string, unknown> = {
    schemaVersion: 1,
    campaignId: newEventId(),
    characters: { [caster.id]: caster },
    encounters: {},
    activeEncounterId: undefined,
    itemInstances: {},
    items: [],
    party: { gold: 0, silver: 0, copper: 0, electrum: 0, platinum: 0, sharedInventory: [] },
    activeEffects: effectInstanceId !== undefined
      ? { [effectInstanceId]: { id: effectInstanceId, casterId: caster.id, kind: 'spell', spellId: 'bless', appliedConditionIds: [] } }
      : {},
    sessions: {},
    activeSessionId: undefined,
    pendingChoices: {},
    nameRegistry: {},
    notebooks: {},
    locations: {},
    npcs: {},
    bastions: {},
  };
  return CampaignStateSchema.parse(base);
};

const makeApply = (targetId: string, conditionId: string): ConditionAppliedEvent => ({
  id: newEventId(),
  at: '2026-01-01T00:00:00.000Z',
  type: 'ConditionApplied',
  targetId: targetId as never,
  conditionId,
  appliedConditionId: newAppliedConditionId(),
});

describe('Incapacitated → concentration-break on apply (slice 570)', () => {
  const incapacitatingConditions: ReadonlyArray<string> = [
    'incapacitated',
    'stunned',
    'paralyzed',
    'petrified',
    'unconscious',
    'held-paralyzed-active',
    'power-word-stunned-active',
    'hideous-laughter-active',
  ];

  for (const cid of incapacitatingConditions) {
    it(`applying ${cid} to a concentrating character clears concentrationEffectId`, () => {
      const effectId = newEffectInstanceId();
      const caster = buildCaster(effectId);
      const state = buildState(caster, effectId);
      const next = produce(state, (draft) => {
        applyConditionApplied(draft, makeApply(caster.id, cid));
      });
      expect(next.characters[caster.id]!.concentrationEffectId).toBeUndefined();
    });
  }

  it('applying a non-incapacitating condition (poisoned) leaves concentration intact', () => {
    const effectId = newEffectInstanceId();
    const caster = buildCaster(effectId);
    const state = buildState(caster, effectId);
    const next = produce(state, (draft) => {
      applyConditionApplied(draft, makeApply(caster.id, 'poisoned'));
    });
    expect(next.characters[caster.id]!.concentrationEffectId).toBe(effectId);
  });

  it('applying a non-incapacitating condition (frightened) leaves concentration intact', () => {
    const effectId = newEffectInstanceId();
    const caster = buildCaster(effectId);
    const state = buildState(caster, effectId);
    const next = produce(state, (draft) => {
      applyConditionApplied(draft, makeApply(caster.id, 'frightened'));
    });
    expect(next.characters[caster.id]!.concentrationEffectId).toBe(effectId);
  });

  it('applying paralyzed to a non-concentrating character is a no-op for concentration', () => {
    const caster = buildCaster(undefined);
    const state = buildState(caster);
    const next = produce(state, (draft) => {
      applyConditionApplied(draft, makeApply(caster.id, 'paralyzed'));
    });
    expect(next.characters[caster.id]!.concentrationEffectId).toBeUndefined();
  });

  it('applying exhaustion (not in the incapacitating set) leaves concentration intact', () => {
    const effectId = newEffectInstanceId();
    const caster = buildCaster(effectId);
    const state = buildState(caster, effectId);
    const next = produce(state, (draft) => {
      applyConditionApplied(draft, { ...makeApply(caster.id, 'exhaustion'), level: 1 });
    });
    expect(next.characters[caster.id]!.concentrationEffectId).toBe(effectId);
  });
});
