import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type { RNG } from '../rng/index.js';
import type { DiceRollResult } from '../rng/dice.js';
import type { ULID } from '../engine/ids-utils.js';
import type { AppliedConditionId } from '../ids.js';

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
// Phase 1 (slice 406) ships the minimal surface: read-only state + content,
// the RNG + dice helpers, the single `at` timestamp, and id minters. Later
// phases add the curated rules helpers (saves, damage mitigation, the fatal
// chokepoint, spell DC) once a real handler needs them.
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
}
