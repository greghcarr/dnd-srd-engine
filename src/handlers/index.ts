import type { HandlerContext } from './context.js';
import type { Event } from '../schemas/events/index.js';
import type { ContentPack } from '../content/pack.js';

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

// A content pack plus the behavior it supplies, as one unit. Lets a
// consumer author a pack and its handlers in a single module and pass it
// to the engine as one input (`createEngine({ bundles: [...] })`) instead
// of threading `contentPacks` and `handlers` separately. The `pack` is an
// already-loaded ContentPack (data, JSON or object literal); `handlers`
// carries this pack's bespoke mechanics. See docs/plugin-api-design.md.
export interface ContentBundle {
  readonly pack: ContentPack;
  readonly handlers?: HandlerRegistry;
}

// Merges handler registries (from `opts.handlers` + each bundle) into one,
// throwing on a handlerId collision across registries. Mirrors the
// content-pack id-collision policy (slice 400): two bundles can't silently
// clobber each other's behavior.
export const mergeHandlerRegistries = (
  registries: ReadonlyArray<HandlerRegistry | undefined>,
): HandlerRegistry => {
  const action: Record<string, ActionHandler> = {};
  const effect: Record<string, EffectHandler> = {};
  for (const reg of registries) {
    if (reg === undefined) continue;
    for (const [id, handler] of Object.entries(reg.action ?? {})) {
      if (id in action) {
        throw new Error(`Duplicate action handler '${id}' supplied by more than one bundle/registry`);
      }
      action[id] = handler;
    }
    for (const [id, handler] of Object.entries(reg.effect ?? {})) {
      if (id in effect) {
        throw new Error(`Duplicate effect handler '${id}' supplied by more than one bundle/registry`);
      }
      effect[id] = handler;
    }
  }
  return { action, effect };
};

export { HANDLER_API_VERSION } from './context.js';
export type { HandlerContext } from './context.js';
