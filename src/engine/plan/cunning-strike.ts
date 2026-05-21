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

// Rogue Cunning Strike options. Each forgoes a number of Sneak Attack d6
// ("the die cost") and applies an effect immediately after the Sneak
// Attack damage. The L5 options are Poison / Trip / Withdraw; Devious
// Strikes (L14) adds Obscure and Knock Out. Daze (L14) is deferred: "on
// its next turn it can do only one of move / action / Bonus Action" needs
// a partial-action-economy primitive the engine doesn't model.
export type CunningStrikeOption = 'poison' | 'trip' | 'withdraw' | 'obscure' | 'knockout';

const ONE_MINUTE_ROUNDS = 10;
const END_OF_NEXT_TURN_ROUNDS = 1;

interface CunningStrikeSpec {
  readonly costDice: number; // Sneak Attack d6 forgone
  readonly save?: { readonly ability: AbilityScore; readonly conditionId: string };
  readonly withdraw?: boolean;
  // Devious Strikes (Rogue L14) options; require that level.
  readonly devious?: boolean;
  // Round-based expiry stamped on the applied condition (turnEnd trigger).
  readonly expiryRounds?: number;
}
const SPECS: Record<CunningStrikeOption, CunningStrikeSpec> = {
  poison: { costDice: 1, save: { ability: 'CON', conditionId: 'poisoned' }, expiryRounds: ONE_MINUTE_ROUNDS },
  trip: { costDice: 1, save: { ability: 'DEX', conditionId: 'prone' } },
  withdraw: { costDice: 1, withdraw: true },
  obscure: { costDice: 3, save: { ability: 'DEX', conditionId: 'blinded' }, devious: true, expiryRounds: END_OF_NEXT_TURN_ROUNDS },
  knockout: { costDice: 6, save: { ability: 'CON', conditionId: 'unconscious' }, devious: true, expiryRounds: ONE_MINUTE_ROUNDS },
};

const SAVE_DC_BASE = 8;
const CUNNING_STRIKE_LEVEL = 5;
const DEVIOUS_STRIKES_LEVEL = 14;

export const CUNNING_STRIKE_OPTIONS: ReadonlyArray<CunningStrikeOption> = ['poison', 'trip', 'withdraw', 'obscure', 'knockout'];

// The minimum Rogue level required for a chosen set of effects: L14 if any
// is a Devious Strikes option (Obscure / Knock Out), else L5.
export const cunningStrikeMinLevel = (effects: ReadonlyArray<CunningStrikeOption>): number =>
  effects.some((e) => SPECS[e].devious === true) ? DEVIOUS_STRIKES_LEVEL : CUNNING_STRIKE_LEVEL;

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
//   - Poison:   CON save vs the rogue's DC or Poisoned (1 minute).
//   - Trip:     DEX save vs the rogue's DC or Prone.
//   - Withdraw: the rogue Disengages (movement won't provoke).
//   - Obscure (Devious Strikes, L14): DEX save or Blinded until the end
//     of its next turn.
//   - Knock Out (Devious Strikes, L14): CON save or Unconscious (1 minute).
// RAW deviations (documented in starter-pack-gaps.md): Poison's and Knock
// Out's end-of-turn repeat save, Knock Out's "until it takes any damage"
// early end, Trip's "Large or smaller" size gate, and Withdraw's half-Speed
// cap are not modeled (the engine has no repeat-save / damage-end on the
// base conditions, size, or movement-distance surface here).
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
        ...(spec.expiryRounds !== undefined && currentRound !== undefined
          ? { expiresOnRound: currentRound + spec.expiryRounds, expiryTrigger: 'turnEnd' as const }
          : {}),
      };
      events.push(applied);
    }
  }
  return events;
};
