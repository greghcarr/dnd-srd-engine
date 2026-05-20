import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { AbilityScore } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { computeSavingThrow } from '../../derive/save.js';
import { newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import type { ULID } from '../ids-utils.js';

export interface SaveRollResult {
  readonly event: SaveRolledEvent;
  readonly success: boolean;
}

export interface RollSaveInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly targetId: string;
  readonly ability: AbilityScore;
  readonly dc: number;
  readonly sourceIsMagical: boolean;
  readonly rng: RNG;
  readonly at: string;
}

// Rolls a fixed-DC saving throw for `targetId` against `dc`, baking the
// d20(s) and computed bonus into a SaveRolled event. Consumes RNG, so it
// belongs to the planner layer (never reducers). Returns undefined when
// the target id doesn't resolve. This is the shared shape three older
// planners (use-item Save, recurring-save, breath-weapon) still inline;
// new save-rolling code routes through here.
export const rollSaveAgainstDC = (input: RollSaveInput): SaveRollResult | undefined => {
  const target = input.state.characters[input.targetId];
  if (!target) return undefined;
  const derivation = computeSavingThrow({
    character: target,
    itemInstances: input.state.itemInstances,
    content: input.content,
    ability: input.ability,
    characters: input.state.characters,
    sourceIsMagical: input.sourceIsMagical,
  });
  const rolls: number[] = [rollDie(D20_SIDES, input.rng)];
  if (derivation.hasAdvantage || derivation.hasDisadvantage) {
    rolls.push(rollDie(D20_SIDES, input.rng));
  }
  const used = derivation.hasAdvantage
    ? 'advantage'
    : derivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  const usedD20 = derivation.hasAdvantage
    ? Math.max(...rolls)
    : derivation.hasDisadvantage
      ? Math.min(...rolls)
      : rolls[0]!;
  const total = usedD20 + derivation.total;
  const success = total >= input.dc;
  const event: SaveRolledEvent = {
    id: newEventId() as ULID,
    at: input.at,
    type: 'SaveRolled',
    targetId: input.targetId as ULID,
    ability: input.ability,
    dc: input.dc,
    d20: rolls,
    used,
    bonus: derivation.total,
    total,
    success,
    breakdown: [...derivation.breakdown],
  };
  return { event, success };
};
