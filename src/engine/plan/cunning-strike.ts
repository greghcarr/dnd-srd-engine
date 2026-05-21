import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { DisengagedEvent } from '../../schemas/events/movement.js';
import type { AbilityScore } from '../../schemas/primitives.js';
import type { ULID } from '../ids-utils.js';

// Rogue Cunning Strike (L5) options. Each forgoes a number of Sneak
// Attack d6 ("the die cost") and applies an effect immediately after the
// Sneak Attack damage. Devious Strikes (L14: Daze / Knock Out / Obscure)
// are deferred; this module covers the three L5 options.
export type CunningStrikeOption = 'poison' | 'trip' | 'withdraw';

interface CunningStrikeSpec {
  readonly costDice: number; // Sneak Attack d6 forgone
  readonly save?: { readonly ability: AbilityScore; readonly conditionId: string };
  readonly withdraw?: boolean;
}
const SPECS: Record<CunningStrikeOption, CunningStrikeSpec> = {
  poison: { costDice: 1, save: { ability: 'CON', conditionId: 'poisoned' } },
  trip: { costDice: 1, save: { ability: 'DEX', conditionId: 'prone' } },
  withdraw: { costDice: 1, withdraw: true },
};

const SAVE_DC_BASE = 8;
const POISON_DURATION_ROUNDS = 10; // 1 minute

export const CUNNING_STRIKE_OPTIONS: ReadonlyArray<CunningStrikeOption> = ['poison', 'trip', 'withdraw'];

// Total Sneak Attack dice forgone for a chosen set of Cunning Strike
// effects (each L5 option costs 1d6).
export const cunningStrikeForgoDice = (effects: ReadonlyArray<CunningStrikeOption>): number =>
  effects.reduce((sum, e) => sum + SPECS[e].costDice, 0);

// RAW: the save DC for a Cunning Strike effect is 8 + the rogue's
// Dexterity modifier + Proficiency Bonus.
export const cunningStrikeSaveDC = (rogue: Character): number =>
  SAVE_DC_BASE + abilityModifier(rogue.abilityScores.DEX) + proficiencyBonus(computeTotalLevel(rogue));

export interface CunningStrikeEffectsInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly rng: RNG;
  readonly at: string;
  readonly rogue: Character;
  readonly targetId: string;
  readonly effects: ReadonlyArray<CunningStrikeOption>;
}

// Builds the events for the chosen Cunning Strike effects, fired right
// after the Sneak Attack damage:
//   - Poison: CON save vs the rogue's DC or Poisoned (1 minute).
//   - Trip:   DEX save vs the rogue's DC or Prone.
//   - Withdraw: the rogue Disengages (movement won't provoke).
// RAW deviations (documented in starter-pack-gaps.md): the Poison's
// end-of-turn repeat save, Trip's "Large or smaller" size gate, and
// Withdraw's half-Speed cap are not modeled (the engine has no
// repeat-save-on-base-Poisoned, size, or movement-distance surface here).
export const buildCunningStrikeEffects = (input: CunningStrikeEffectsInput): Event[] => {
  const { state, content, rng, at, rogue, targetId, effects } = input;
  const dc = cunningStrikeSaveDC(rogue);
  const events: Event[] = [];
  const encounter = state.activeEncounterId !== undefined ? state.encounters[state.activeEncounterId] : undefined;
  const currentRound = encounter?.round;
  for (const option of effects) {
    const spec = SPECS[option];
    if (spec.withdraw === true) {
      if (encounter !== undefined) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'Disengaged',
          encounterId: encounter.id,
          combatantId: rogue.id as ULID,
        } satisfies DisengagedEvent);
      }
      continue;
    }
    if (spec.save === undefined) continue;
    const save = rollSaveAgainstDC({
      state, content, targetId, ability: spec.save.ability, dc, sourceIsMagical: false, rng, at,
    });
    if (save === undefined) continue;
    events.push(save.event);
    if (!save.success) {
      const applied: ConditionAppliedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: targetId as ULID,
        conditionId: spec.save.conditionId,
        appliedConditionId: newAppliedConditionId(),
        ...(spec.save.conditionId === 'poisoned' && currentRound !== undefined
          ? { expiresOnRound: currentRound + POISON_DURATION_ROUNDS, expiryTrigger: 'turnEnd' as const }
          : {}),
      };
      events.push(applied);
    }
  }
  return events;
};
