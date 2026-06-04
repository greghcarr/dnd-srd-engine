import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { planConcentrationOnDamage } from './concentration.js';
import type { ULID } from '../ids-utils.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { ItemInstance } from '../../schemas/runtime/item-instance.js';
import type { RNG } from '../../rng/index.js';
import { collectEffectsFromCharacter } from '../../derive/effect-stack.js';

const FALLING_FEET_PER_DIE = 10;
const FALLING_DIE_AVERAGE = 3.5;
const FALLING_MAX_DICE = 20;
const SLOW_FALL_MIN_MONK_LEVEL = 4;
const SLOW_FALL_FEET_REDUCED_PER_MONK_LEVEL = 5;

export interface FallingIntent {
  readonly type: 'Falling';
  readonly characterId: string;
  readonly distanceFeet: number;
  // Opt-in to spending the character's reaction to apply Monk Slow Fall
  // (Monk L4+): reduce the falling damage by `5 × monk level` before
  // mitigation. Throws if the character isn't a Monk L4+, has already
  // used their reaction this round (while in an active encounter), or
  // is currently the active combatant (reactions on your own turn are
  // allowed by RAW; this check only rejects double-use).
  readonly useSlowFall?: boolean;
  readonly at?: string;
}

const fallingDieCount = (distanceFeet: number): number =>
  Math.min(FALLING_MAX_DICE, Math.floor(distanceFeet / FALLING_FEET_PER_DIE));

const expectedFallingDamage = (distanceFeet: number): number => {
  const dice = fallingDieCount(distanceFeet);
  return Math.round(dice * FALLING_DIE_AVERAGE);
};

const monkLevel = (character: Character): number => {
  const monk = character.classes.find((c) => c.classId === 'monk');
  return monk?.level ?? 0;
};

const hasFallingProtection = (
  character: Character,
  content: ResolvedContent,
  itemInstances: Readonly<Record<string, ItemInstance>>,
): boolean => {
  const effects = collectEffectsFromCharacter({ character, content, itemInstances });
  return effects.some((e) => e.kind === 'GrantFallingProtection');
};

export const planFalling = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: FallingIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (intent.distanceFeet < 0) {
    throw new Error('Falling distance must be non-negative');
  }
  if (hasFallingProtection(character, content, state.itemInstances)) return [];
  let rawDamage = expectedFallingDamage(intent.distanceFeet);
  if (rawDamage <= 0) return [];

  let slowFallReactionConsumed: ActionEconomyConsumedEvent | undefined;
  if (intent.useSlowFall === true) {
    const level = monkLevel(character);
    if (level < SLOW_FALL_MIN_MONK_LEVEL) {
      throw new Error(
        `${character.name} does not have Slow Fall (requires Monk L${SLOW_FALL_MIN_MONK_LEVEL}+, has Monk L${level})`,
      );
    }
    const activeEncounterId = state.activeEncounterId;
    if (activeEncounterId !== undefined) {
      const encounter = state.encounters[activeEncounterId];
      const reactor = encounter?.combatants.find((c) => c.combatantId === character.id);
      if (reactor !== undefined && reactor.turnUsage.reactionUsedThisRound) {
        throw new Error(`${character.name} has already used their reaction this round`);
      }
      if (reactor !== undefined) {
        slowFallReactionConsumed = {
          id: newEventId() as ULID,
          at: intent.at ?? nowIso(),
          type: 'ActionEconomyConsumed',
          encounterId: activeEncounterId,
          combatantId: character.id,
          kind: 'reaction',
        };
      }
    }
    const reduction = SLOW_FALL_FEET_REDUCED_PER_MONK_LEVEL * level;
    rawDamage = Math.max(0, rawDamage - reduction);
  }

  if (rawDamage <= 0) {
    return slowFallReactionConsumed !== undefined ? [slowFallReactionConsumed] : [];
  }

  const mitigated = mitigateDamage({
    character,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: rawDamage, type: 'bludgeoning' }],
    characters: state.characters,
  });
  const at = intent.at ?? nowIso();
  const damageAppliedId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: intent.characterId,
    mitigatedComponents: mitigated,
    causedByEventId: damageAppliedId,
    at,
  });
  const damageApplied: DamageAppliedEvent = {
    id: damageAppliedId,
    at,
    type: 'DamageApplied',
    targetId: intent.characterId,
    components: intercept.components,
    source: `falling ${intent.distanceFeet} ft`,
  };
  const concentrationBreak = planConcentrationOnDamage(
    state,
    content,
    rng,
    character,
    intercept.components,
    damageApplied.id,
    at,
  );
  const tail = [damageApplied, ...intercept.extraEvents, ...concentrationBreak];
  return slowFallReactionConsumed !== undefined
    ? [slowFallReactionConsumed, ...tail]
    : tail;
};
