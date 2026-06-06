import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckForCharacter } from './_halfling-luck.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { pushDestination } from '../../derive/pathing.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import type { ULID } from '../ids-utils.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';

// Monk Open Hand Technique (Warrior of the Open Hand, L3). The three
// effects the monk may impose on a Flurry of Blows hit. Addle is a flat
// marker; Push and Topple call for a saving throw against the monk's
// Ki save DC.
export type OpenHandTechnique = 'addle' | 'push' | 'topple';

const SAVE_DC_BASE = 8;
const PUSH_DISTANCE_FEET = 15; // RAW: Open Hand Push is 15 ft (mastery Push is 10).
const ADDLED_CONDITION_ID = 'addled';
const PRONE_CONDITION_ID = 'prone';

// The Monk's save DC for class features keys off Wisdom: 8 + Proficiency
// Bonus + Wisdom modifier (the same DC Stunning Strike uses).
const monkSaveDC = (monk: Character): number =>
  SAVE_DC_BASE + proficiencyBonus(computeTotalLevel(monk)) + abilityModifier(monk.abilityScores.WIS);

const rollSave = (
  ability: 'STR' | 'DEX',
  targetId: string,
  target: Character,
  dc: number,
  rng: RNG,
  at: string,
  state: CampaignState,
  content: ResolvedContent,
): { event: SaveRolledEvent; success: boolean } => {
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on Open Hand Technique target save.
  const d20 = applyHalflingLuckForCharacter(rolls[0]!, targetId, state, content, rolls, rng);
  const bonus = abilityModifier(target.abilityScores[ability]);
  const total = d20 + bonus;
  const success = total >= dc;
  return {
    success,
    event: {
      id: newEventId() as ULID,
      at,
      type: 'SaveRolled',
      targetId,
      ability,
      dc,
      d20: rolls,
      used: 'none',
      bonus,
      total,
      success,
    },
  };
};

const applyConditionEvent = (targetId: string, conditionId: string, at: string): ConditionAppliedEvent => ({
  id: newEventId() as ULID,
  at,
  type: 'ConditionApplied',
  targetId: targetId as ULID,
  conditionId,
  appliedConditionId: newAppliedConditionId(),
});

export interface OpenHandTechniqueInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly monk: Character;
  readonly targetId: string;
  readonly technique: OpenHandTechnique;
  readonly rng: RNG;
  readonly at: string;
}

// Builds the events for one Open Hand Technique application against a
// target that was just hit by a Flurry strike. `state` should already
// reflect the strike (and any prior technique applications this Flurry),
// so Push reads the target's current position.
//
// - Addle: no save; applies the `addled` condition (the OA planner reads
//   it to reject Opportunity Attacks until the target's next turn).
// - Push: Strength save vs the Monk's Ki DC or pushed 15 ft straight away
//   from the monk. Like weapon-mastery Push, the move only emits when the
//   encounter tracks positions; otherwise the save resolves with no move.
// - Topple: Dexterity save vs the Monk's Ki DC or the Prone condition.
export const applyOpenHandTechnique = (input: OpenHandTechniqueInput): ReadonlyArray<Event> => {
  const { state, content, monk, targetId, technique, rng, at } = input;

  if (technique === 'addle') {
    return [applyConditionEvent(targetId, ADDLED_CONDITION_ID, at)];
  }

  const target = state.characters[targetId];
  if (!target) throw new Error(`Unknown target ${targetId}`);
  const dc = monkSaveDC(monk);

  if (technique === 'topple') {
    const { event, success } = rollSave('DEX', targetId, target, dc, rng, at, state, content);
    return success ? [event] : [event, applyConditionEvent(targetId, PRONE_CONDITION_ID, at)];
  }

  // Push: Strength save, then a straight-away shove on a failure.
  const { event, success } = rollSave('STR', targetId, target, dc, rng, at, state, content);
  if (success) return [event];

  const encounter = state.activeEncounterId !== undefined ? state.encounters[state.activeEncounterId] : undefined;
  const targetCombatant = encounter?.combatants.find((c) => c.combatantId === targetId);
  if (encounter === undefined || targetCombatant?.position === undefined) {
    // Positionless encounter: the save still resolves; the consumer
    // narrates the shove (consistent with weapon-mastery Push).
    return [event];
  }
  const monkPos = encounter.combatants.find((c) => c.combatantId === monk.id)?.position;
  const from = targetCombatant.position;
  const dx = monkPos !== undefined ? Math.sign(from.x - monkPos.x) || 1 : 1;
  const dy = monkPos !== undefined ? Math.sign(from.y - monkPos.y) || 0 : 0;
  // Slice 698: shove onto a legal cell (in-bounds, non-impassable,
  // unoccupied), stopping against an obstacle, instead of a raw off-grid
  // vector. Same fix as weapon-mastery Push.
  const locationId = state.characterLocations[targetId];
  const location = locationId !== undefined ? state.locations[locationId] : undefined;
  const doors = (location?.doorIds ?? [])
    .map((id) => state.doors[id])
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  const occupiedFeet = encounter.combatants
    .filter((c) => c.combatantId !== targetId && c.position !== undefined)
    .map((c) => c.position as { x: number; y: number });
  const to = pushDestination({ x: from.x, y: from.y }, { dx, dy }, PUSH_DISTANCE_FEET, {
    map: location?.map,
    doors,
    occupiedFeet,
  });
  const feetTraveled = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (feetTraveled === 0) return [event]; // shoved against an obstacle: no move
  const moved: CombatantMovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'CombatantMoved',
    encounterId: encounter.id,
    combatantId: targetId,
    fromPosition: { x: from.x, y: from.y },
    toPosition: to,
    feetTraveled,
  };
  return [event, moved];
};
