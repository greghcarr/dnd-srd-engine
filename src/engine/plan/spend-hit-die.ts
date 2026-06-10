import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { HitDieSpentEvent } from '../../schemas/events/resources.js';
import type { RNG } from '../../rng/index.js';
import type { HitDie } from '../../schemas/primitives.js';
import { rollDie } from '../../rng/dice.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { abilityModifier, effectiveAbilityScore } from '../../derive/ability.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

// SRD 5.2.1 Short Rest (rules-glossary.md, "Short Rest"): "You can spend one
// or more of your Hit Point Dice to regain Hit Points. For each Hit Point Die
// you spend in this way, roll the die and add your Constitution modifier to
// it. You regain Hit Points equal to the total (minimum of 1 Hit Point)."
const HIT_DIE_MIN_HEAL = 1;

export interface SpendHitDieIntent {
  readonly type: 'SpendHitDie';
  readonly characterId: string;
  readonly at?: string;
}

// The short rest's defining benefit: spend one Hit Die to heal. The
// `HitDieSpentEvent` + `applyHitDieSpent` reducer already existed; this is
// the planner that captures the roll (so the heal replays deterministically)
// and applies the RAW Constitution-modifier + minimum-1 math.
//
// A short rest itself (planShortRest) is just the start/end envelope; the
// engine doesn't model "currently resting" as turn state, so the consumer
// sequences one planSpendHitDie call per die the player chooses to spend
// between the rest's start and end (the same seam Second Wind uses — no
// encounter/rest gate here).
//
// The reducer decrements the FIRST class enrollment with Hit Dice remaining,
// so this planner rolls THAT enrollment's hit die to stay in lockstep with
// it. Letting a multiclass character pick WHICH die size to spend would need
// a classId on the event + reducer; that choice is deferred — the engine
// spends Hit Dice in class-array order.
export const planSpendHitDie = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: SpendHitDieIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);

  // RAW: a creature at 0 HP is dying and Unconscious — it can't take a Short
  // Rest or spend Hit Dice. Block it so a die isn't burned for 0 healing
  // (the reducer also no-ops the heal at 0 HP, but spending the die is wrong).
  if (character.hp.current <= 0) {
    throw new Error(`${character.name} is at 0 HP and cannot spend Hit Dice`);
  }

  const enrollment = character.classes.find((c) => c.hitDiceRemaining > 0);
  if (enrollment === undefined) {
    throw new Error(
      `${character.name} has no Hit Dice remaining (spent dice return on a Long Rest)`,
    );
  }

  const classDef = content.classes.get(enrollment.classId);
  if (classDef === undefined) {
    throw new Error(`Unknown class ${enrollment.classId} for ${character.name}`);
  }
  const die: HitDie = classDef.hitDie;

  // Effective Constitution modifier (Amulet of Health floor, Ioun Stone
  // increase, etc. all compose through the same accumulator the saves use).
  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const con = effectiveAbilityScore(
    character.abilityScores.CON,
    effects.effectiveAbilityScoreFloor('CON')?.value,
    effects.effectiveAbilityScoreIncrease('CON'),
  );
  const conMod = abilityModifier(con);

  const rolled = rollDie(die, rng);
  const healed = Math.max(HIT_DIE_MIN_HEAL, rolled + conMod);

  const at = intent.at ?? nowIso();
  const event: HitDieSpentEvent = {
    id: newEventId() as ULID,
    at,
    type: 'HitDieSpent',
    characterId: intent.characterId as ULID,
    die,
    rolled,
    conMod,
    healed,
  };
  return [event];
};
