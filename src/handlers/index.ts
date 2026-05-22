import type { HandlerContext } from './context.js';
import type { Event } from '../schemas/events/index.js';

// Axis A: effect-lifecycle handlers (conditions / buffs / auras). Fires
// from the planner/trigger layer when a Custom effect is applied, ticks,
// or expires. (Not yet invoked; wired in a later phase.)
export interface EffectHandler {
  onApply?(ctx: HandlerContext, params: unknown): ReadonlyArray<Event>;
  onTick?(ctx: HandlerContext, params: unknown, trigger: Event): ReadonlyArray<Event>;
  onExpire?(ctx: HandlerContext, params: unknown): ReadonlyArray<Event>;
}

// Axis B: action/cast handlers (bespoke spells / items / actions). The
// consumer invokes one via `engine.plan.custom(state, { handlerId, params })`,
// which calls `plan(ctx, params)` and commits the returned events like any
// planner. Same determinism contract as a built-in planner: runs at plan
// time, consumes `ctx.rng`, bakes rolls into the returned (existing-typed)
// events.
export interface ActionHandler {
  plan(ctx: HandlerContext, params: unknown): ReadonlyArray<Event>;
}

export interface HandlerRegistry {
  readonly effect?: Readonly<Record<string, EffectHandler>>;
  readonly action?: Readonly<Record<string, ActionHandler>>;
}

export { HANDLER_API_VERSION } from './context.js';
export type { HandlerContext } from './context.js';
