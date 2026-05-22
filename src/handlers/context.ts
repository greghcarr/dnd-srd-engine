import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { Character } from '../schemas/runtime/character.js';
import type { ResolvedContent } from '../content/pack.js';
import type { RNG } from '../rng/index.js';
import type { DiceRollResult } from '../rng/dice.js';
import type { ULID } from '../engine/ids-utils.js';
import type { AppliedConditionId, EffectInstanceId } from '../ids.js';

// Bumped when the HandlerContext surface changes incompatibly. Consumer
// plugin code can read `ctx.apiVersion` to guard against a host engine it
// wasn't built for. Additive context fields keep this stable; removing or
// changing a field is a major bump documented in a migration note.
export const HANDLER_API_VERSION = 1 as const;

// The curated, versioned surface a consumer-supplied handler runs against.
// Handlers run at PLAN time (never at apply/replay), consume `rng` freely,
// bake the results into the events they return, and emit only EXISTING
// event types. See docs/plugin-api-design.md for the determinism contract.
//
// Grown on demand: slice 406 shipped the minimal surface (state, content,
// rng, dice, at, id minters); slice 407 added the rules helpers the first
// retrofit (elemental-weapon) needs (`assertActorCanAct`,
// `spellSlotsRemaining`, `newEffectInstanceId`). Later retrofits add the
// save/damage cluster (computeSavingThrow, mitigateDamage, the fatal
// chokepoint, spell DC) when thunder-step / absorb-elements need them.
// Everything here is a versioned contract; keep it as small as the use
// cases demand.
export interface HandlerContext {
  readonly apiVersion: typeof HANDLER_API_VERSION;
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly rng: RNG;
  readonly at: string;
  rollDie(die: number): number;
  rollExpression(expression: string): DiceRollResult;
  newEventId(): ULID;
  newAppliedConditionId(): AppliedConditionId;
  newEffectInstanceId(): EffectInstanceId;
  // Throws with a user-readable message if the character can't take an
  // action (incapacitated / stunned / etc.). Mirrors the built-in planners.
  assertActorCanAct(character: Character, actionLabel: string): void;
  // Remaining standard spell slots of the given level for the character.
  spellSlotsRemaining(character: Character, slotLevel: number): number;
}
