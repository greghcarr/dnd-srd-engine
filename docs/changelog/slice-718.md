# Slice 718 — engine: wire RecoverResource on a Short Rest (L5 Font of Inspiration + Sorcerous Restoration)

**Type:** Engine primitive + two canonical users (effect wiring + content). First slice of the L5 SRD-complete cycle. Additive; no behavior change for characters without a RecoverResource effect.

The L5 audit found `RecoverResource` was a no-op (it sat in the effect-builder's fall-through and the rest reducer only honored the per-resource `recharge` cadence), so two L5 features were content-declared but mechanically dead:

- **Bard Font of Inspiration** (L5): "regain all your expended uses of Bardic Inspiration when you finish a Short or Long Rest." `RecoverResource{resourceId:'bardic-inspiration', amount:'all', when:'shortRest'}`.
- **Sorcerer Sorcerous Restoration** (L5): "When you finish a Short Rest, you can regain expended Sorcery Points, but no more than half your Sorcerer level (round down). Once you use this feature, you can't do so again until you finish a Long Rest."

## What changed

1. **`RecoverResource` is resolved at plan time and applied by the rest reducer.** `planShortRest` (now content-aware) walks each participant's effect stack for `RecoverResource{when:'shortRest'}`, resolves the amount against the **pre-rest** state, and bakes per-participant `resourceDeltas` onto the `ShortRestEnded` event; `applyShortRestEnded` applies them (clamped to `0..max`). This keeps the reducer pure (no content) and replay-deterministic (amounts are resolved, not recomputed). Amount handling: `'all'` → fill to max; a number or `Formula` → capped to the resource's headroom.

2. **A once-per-X gate on `RecoverResource`.** New optional `limitedByResourceId`: the recovery applies only when that resource is available (`current > 0`) and spends 1 of it. Sorcerous Restoration is gated by a `sorcerous-restoration` resource (`max 1`, `recharge:'longRest'`), so it fires at most once per Long Rest. The half-level amount is a `floor(level('sorcerer') × 0.5)` Formula — `floor(5/2) = 2` at L5 — replacing the prior incorrect flat `4`.

3. **`planShortRest` is backward-compatible** (mirrors `planLongRest`'s slice-542 overload): `planShortRest(state, intent)` keeps the pre-718 behavior (no recovery); `planShortRest(state, content, intent)` enables it. `engine.plan.shortRest` / `engine.plan.rest` now pass content.

Long-rest recovery is intentionally NOT wired: `applyLongRestEnded` already refills every resource to max, so a `RecoverResource{when:'longRest'}` is subsumed (and a gate spend after that refresh would be wrong). Recovery is short-rest-only.

## Files

- [src/schemas/effects.ts](../../src/schemas/effects.ts): `RecoverResource.limitedByResourceId?`.
- [src/schemas/events/rest.ts](../../src/schemas/events/rest.ts): `resourceDeltas?` on `ShortRestEnded` / `LongRestEnded`.
- [src/engine/plan/rest.ts](../../src/engine/plan/rest.ts): `restRecoveryDeltas` helper; content-aware `planShortRest`.
- [src/engine/reducers/rest.ts](../../src/engine/reducers/rest.ts): apply `resourceDeltas` in `applyShortRestEnded`.
- [src/engine/index.ts](../../src/engine/index.ts): thread content into `shortRest` / `rest`.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Sorcerous Restoration → gate `GrantResource` + half-level `RecoverResource`. (Font of Inspiration was already authored correctly.)
- [tests/unit/engine/slice-718-recover-resource.test.ts](../../tests/unit/engine/slice-718-recover-resource.test.ts) (new): Font of Inspiration regains all on short rest at L5 (not at L4); Sorcerous Restoration regains floor(level/2) once per long rest (gate blocks a second short rest; long rest resets); capped at headroom.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. The direct `planShortRest(state, intent)` caller (rng-capture golden) is unchanged (backward-compatible signature); rest / resource / recharge tests pass.

## Audit (Uncle Bob)

- **Plan/commit split honored**: effects (content) are read at plan time; the reducer stays pure and applies resolved deltas. Mirrors the slice-542 HeroicInspiration-on-long-rest pattern.
- **Reuse**: amount resolution reuses `evaluateFormula` + `collectEffectsFromCharacter` (the same helpers `seedResourcesFromContent` uses); no second formula path.
- **Determinism**: amounts resolved against pre-rest state and baked on the event; clamp is order-independent.
- **SRD-faithful**: Sorcerous Restoration amount corrected to `floor(level/2)` and limited once per Long Rest; Font of Inspiration regains all on short rest.
- **No over-recovery**: capped to headroom; the gate is spent only when a recovery actually happens.

## Open follow-ups (L5 cycle)

- Sorcerous Restoration is auto-applied on a Short Rest when its gate is available (the SRD frames it as "you can"); a player-opt-in path could be added if a consumer needs to decline it.
- Remaining L5 stubs to wire this cycle: Cleric Sear Undead, Druid Wild Resurgence, Paladin Faithful Steed, Fighter Tactical Shift, Wizard Memorize Spell; plus the Warlock invocations 4→5 content drift; then the `srd-l5-complete` floor audit + fuzz-to-L5.
