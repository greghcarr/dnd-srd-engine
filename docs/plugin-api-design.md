# Plugin API design (proposal)

**Status: in progress.** The custom-action seam (slice 406) + context enrichment + the two content-specific retrofits (Elemental Weapon slice 407, Absorb Elements slice 408) shipped; Thunder Step is intentionally left in the engine as shared-vocabulary glue (see Phase 3). Slice 409 added `ContentBundle` (`{ pack, handlers }`) so a pack and its behavior are one `createEngine({ bundles })` input, with cross-bundle handler-id collision detection. Axis A (effect-lifecycle) and the `requiredHandlers` pack manifest remain, to build when a consumer needs them. This captures how a content pack ships consumer-supplied *code* (handlers/planners for bespoke mechanics) alongside its JSON, so the engine becomes extensible by data *and* behavior, not data alone. It exists to pin the hard constraints and the public-API contract before each phase, because a plugin API is a long-lived commitment.

Motivating question (the user's): a pack like `phb-2024-extras.json` references behaviors (absorb-elements, thunder-step) that today live as hardcoded engine planners. Could a consumer instead ship a code file alongside their pack supplying those behaviors, so the engine doesn't have to carry code for content it doesn't ship?

## Current reality (the starting point)

- All behavior is engine code: the generic `planCastSpell` (reads declarative `mechanicalEffects`), the 52 effect primitives, and ~54 dedicated planners in `src/engine/plan/`. Content packs are pure **data** that names mechanics the engine already implements.
- The extension scaffold exists but is **inert**: `HandlerRegistry`, `EffectHandler` (`onApply` / `onTick` / `onExpire`), the `engine.handlers?` option, and the `Custom { handlerId }` effect kind. None is wired: `opts.handlers` is never read, the `Custom` case in [src/effects/builder.ts](../src/effects/builder.ts) is a no-op, and no registry method is ever invoked. Today a `Custom { handlerId }` is only a **marker string** a hardcoded planner keys off (e.g. `martial-arts` in the attack planner).

So this proposal is about **finishing the scaffold into a real seam**, on terms the architecture allows.

## Goal and non-goals

**Goal.** A consumer can register code that supplies the behavior for a pack's bespoke mechanics, and load it alongside the pack JSON, without modifying the engine.

**Non-goals.**
- Packs auto-executing code. The engine is a library; it never imports or runs arbitrary files. The consumer explicitly imports the code module and registers it. The "code file beside the JSON" is a consumer-side packaging convention, not engine behavior.
- Consumer-defined **event types** or **reducers**. Those would break replay, schema-versioning, and migration guarantees (see constraints). Handlers compose the engine's *existing* event vocabulary; they don't add to it.
- Replacing the primitive vocabulary. Most content is still data-only; plugins are the escape hatch for genuinely novel procedural mechanics, exactly like `CustomEffect` was always meant to be.

## Hard constraints (these shape everything)

The locked architecture (see [docs/architecture.md](architecture.md)) dictates the rules a handler must obey:

1. **Plan/commit split: RNG lives only in planners.** `engine.plan(...)` is the only place randomness is consumed; resolution events carry baked rolls. Therefore a handler that needs randomness **runs at plan time** and **bakes its rolls into the events it returns**.
2. **`apply()` is pure and RNG-free; replay re-applies baked events.** Therefore handlers **must never run during `apply()` or replay**. The invocation point is the planner/trigger layer, not the reducer. At replay the handler's already-emitted events are simply re-applied; the handler does not run again.
3. **Events are the only state-change mechanism, and they are Zod-validated existing types.** A handler returns `ReadonlyArray<Event>` of **existing** event types (DamageApplied, ConditionApplied, Healed, CombatantMoved, etc.). It cannot invent event types.
4. **Determinism + purity.** Given the same `(state, rng, params)`, a handler must return the same events. No I/O, no clocks (the `at` timestamp is supplied), no hidden globals.

These four turn "plugin API" from open-ended into a precise shape: **a pure function, run at plan time, given state + an RNG + curated helpers, returning baked existing-typed events.** That is exactly the shape a dedicated planner already has, which is why the seam is feasible.

## The two extension axes

Behavior attaches to the engine in two distinct places; a complete plugin API needs both.

### Axis A: effect-lifecycle handlers (conditions / buffs / auras)
For mechanics that ride on an *applied effect*. Fires from the planner/trigger layer at three moments:
- `onApply(ctx, params)` when a `Custom` effect is first applied.
- `onTick(ctx, params, trigger)` on the per-turn / on-event tick (the same hook `tickAura` / recurring-save use).
- `onExpire(ctx, params)` when the effect ends.

This matches the existing `EffectHandler` interface. Canonical fit: a homebrew condition that does something each turn.

### Axis B: action/cast handlers (spells / items / actions)
For mechanics invoked as an *action*, the shape absorb-elements / thunder-step actually need (a cast or reaction that emits an event chain). Two sub-options to decide between:
- **B1: a generic `Custom` intent.** `engine.plan.custom(state, { handlerId, ...params })` routes to the registered handler. Wired into `performIntent` via the existing dispatch + the planner-wiring audit's allowlist.
- **B2: spell/item-cast indirection.** `planCastSpell` / `planUseItem`, on encountering a content entry whose mechanic is `{ kind: 'Custom', handlerId }`, delegates to the registered handler instead of the generic pipeline.

B2 is the more seamless one for spell/item packs (the consumer just `engine.plan.castSpell('my-spell')` and the handler fires), but it is the deeper change. B1 is simpler and more explicit. Likely both, with B2 layered on B1.

## HandlerContext: the curated public surface

Today `HandlerContext` is `{ state, rng }`, which is too thin to write absorb-elements (no save rolls, no mitigation). The design widens it to a **deliberately curated, versioned** surface, re-exporting existing engine helpers as the stable plugin API:

```ts
interface HandlerContext {
  readonly apiVersion: number;          // HANDLER_API_VERSION, for compat checks
  readonly state: CampaignState;        // read-only
  readonly rng: RNG;                    // consume freely; results get baked into returned events
  readonly at: string;                  // single timestamp to thread to every emitted event

  // dice + rolls (from src/rng/)
  rollDie(die: number): number;
  rollExpression(expr: string): DiceRollResult;

  // rules helpers (curated from src/derive/ + src/engine/plan/_*)
  abilityModifier(score: number): number;
  computeSavingThrow(input): SaveResult;
  rollSaveAgainstDC(input): SaveRollResult | undefined;
  mitigateDamage(input): DamageComponent[];
  interceptFatalDamage(input): { components; extraEvents };  // the universal damage chokepoint
  computeSpellSaveDC(input): SpellDCResult;
  computeAttackBonus(input): AttackResult;

  // id minting (so handlers emit well-formed events)
  newEventId(): ULID;
  newAppliedConditionId(): AppliedConditionId;
}
```

The exact list is the real design work and the thing we must keep stable. Principle: expose what a planner legitimately needs to compose RAW mechanics (rolls, saves, damage, derivations, id minting), **not** raw engine internals (reducers, the apply switch, immer drafts). Everything exposed becomes a versioned contract; keep the surface as small as the use cases demand and grow it deliberately.

## Pack <-> plugin wiring

1. **The pack declares its code dependency.** Add an optional `requiredHandlers: string[]` to `ContentPackSchema`: the handlerIds this pack's `Custom` effects need supplied. Self-documenting and load-checkable.
2. **The consumer registers + loads.**
   ```ts
   import { createEngine, loadStarterPack, loadContentPack } from 'dnd-srd-engine';
   import { registerMyPackHandlers } from './content-packs/my-pack.js'; // the code file beside the JSON

   const myPack = loadContentPack(JSON.parse(readFileSync('content-packs/my-pack.json', 'utf8')));
   const handlers = createHandlerRegistry();
   registerMyPackHandlers(handlers);              // handlers.register('my-spell', { onApply, ... })
   const engine = createEngine({ contentPacks: [loadStarterPack(), myPack], handlers });
   ```
3. **Load-time validation.** `validatePacks` (and the pack-integrity audit) gains a check: every `requiredHandlers` id (and every `Custom` handlerId referenced by the pack) must be either backed by engine source or present in the supplied registry, so a pack missing its plugin **fails loudly at load**, not silently inert. This generalizes the current "every handlerId is referenced in engine source" audit.

## Versioning + stability

- `HANDLER_API_VERSION` (a monotonic integer, like `SCHEMA_VERSION`). The `HandlerContext` carries it; `createEngine` rejects a registry built against an incompatible major.
- Additive changes to the context (new helpers) bump a minor and stay backward-compatible. Removing/changing a helper signature is a major bump, documented in a migration note.
- The plugin API is exported from the single public barrel ([src/index.ts](../src/index.ts)) and gets its own contract test, the same way the export surface is snapshotted today.

## Security model

The engine never reads the filesystem or imports modules. The consumer is fully responsible for sourcing, vetting, and registering plugin code. A plugin runs with the same trust as the host app. Documented plainly so no one assumes packs are sandboxed.

## Phasing (so it ships incrementally, not as one mega-slice)

1. ~~**Wire Axis B1** (`engine.plan.custom`) with a minimal context.~~ **Shipped (slice 406).** `engine.plan.custom(state, { handlerId, params })` dispatches to a handler registered under `opts.handlers.action[id]`; `HandlerContext` ships the minimal surface (`apiVersion`, `state`, `content`, `rng`, `at`, `rollDie`, `rollExpression`, `newEventId`, `newAppliedConditionId`); `HANDLER_API_VERSION = 1`. Started with Axis B1 rather than Axis A because it is both simpler to wire (a single new plan method, no trigger/tick/expiry hooks) and the axis the retrofit target spells actually use (casts, not effect-lifecycle). Allowlisted in the planner-wiring audit. Canonical user: a homebrew "arcane zap" action handler in [tests/unit/engine/plan-custom-handler.test.ts](../tests/unit/engine/plan-custom-handler.test.ts), with replay-equivalence proven.
2. ◐ **Enrich `HandlerContext`** with the curated rules helpers (grow on demand). **Slice 407:** `assertActorCanAct`, `spellSlotsRemaining`, `newEffectInstanceId` (for Elemental Weapon). **Slice 408:** `assertReactionAvailable`, `consumeActionEconomy` (for Absorb Elements, a reaction). The save/damage cluster (`computeSavingThrow`, `mitigateDamage`, the fatal chokepoint, spell DC) was NOT needed, because the two content-specific retrofits don't roll saves or mitigate; the only planner that would need it (thunder-step) is intentionally not retrofitted (see Phase 3). Surface frozen for now at this set.
3. ✓ **Retro-fit the content-specific non-SRD planners** as reference plugin handlers, removing the spell-named methods from the engine. **Elemental Weapon (slice 407)** and **Absorb Elements (slice 408)** done: `planElementalWeapon` / `engine.plan.elementalWeapon` and `planAbsorbElements` / `engine.plan.absorbElements` deleted; both behaviors now live in reference `ActionHandler`s ([tests/fixtures/handlers/](../tests/fixtures/handlers/)) invoked via `engine.plan.custom`. **Thunder Step is deliberately NOT retrofitted:** unlike the other two (genuinely content-specific behavior), `planThunderStep` is thin glue over CORE movement vocabulary (`resolveDestination` terrain/occupancy/maps + `findCombatant`, shared with SRD Misty Step / Dimension Door) plus the save/damage AoE pipeline. Moving it would force exposing the movement internals as permanent public plugin API for one spell, which violates the "expose what a planner needs, not raw internals" principle. It stays as shared-vocabulary glue. Net: the engine now carries no *content-specific* behavior for unshipped spells.
4. **Wire Axis A** (effect-lifecycle): invoke registered `onApply`/`onTick`/`onExpire` from the effect-lifecycle planner/trigger layer, for homebrew conditions/buffs/auras. (Not yet needed by the retrofits, which are all cast-shaped.)
5. **Pack manifest + validation**: `requiredHandlers` on `ContentPackSchema`, the load-time check in `validatePacks`/pack-integrity, and the authoring docs ([authoring-content-packs.md](authoring-content-packs.md) + [content-packs/README.md](../content-packs/README.md)).
6. **(Optional) Axis B2** (cast/use-item indirection) once the action axis has a real consumer: `planCastSpell` delegates to a registered handler when a spell's mechanic is `Custom`, so the consumer casts via `engine.plan.castSpell('my-spell')` instead of `engine.plan.custom`. Would also let the retrofits reuse the standard cast bookkeeping (slot consume, concentration) instead of re-emitting it.

## Open questions (decide before Phase 3)

- **Axis B shape:** B1 only, or B1 + B2? B2 is the seamless spell/item path but couples plugins into `planCastSpell`.
- **Context breadth:** start minimal and grow on demand (recommended), or design the full surface up front? Minimal-and-grow keeps the contract small but means early plugins may hit gaps.
- **Tick integration:** should plugin `onTick` ride the existing `tickAura` / recurring-save dispatch, or get its own tick entry point?
- **Is the juice worth the squeeze now?** This is real, ongoing API-surface maintenance. It pays off only if there will be real consumers authoring bespoke mechanics. If the near-term need is just *using* the existing non-SRD content (which already works) and authoring content expressible in existing primitives (data-only), this can wait.
