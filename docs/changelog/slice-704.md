# Slice 704 — engine: die-typed roll-provider seam (interactive-play A2)

**Type:** Engine primitive (RNG seam) + tests. Additive; no event schema change; default dice path byte-identical.

Part A2 of interactive-play support: a die-typed, resumable roll seam so a consumer (the dnd-web interactive viewer) can let a player enter their own physical-dice values for their own actions, while planning stays synchronous and pure.

## The seam

Today planners draw all randomness through `rollDie(die, rng)` → `floor(rng.next() * die) + 1` (a value-typed float RNG). A player entering real dice needs a **die-typed** source (it must know the die to map a face), and a **resumable** one (prompt for one die, retry). New module [src/rng/roll-provider.ts](../../src/rng/roll-provider.ts):

- `interface RollProvider { roll(die: number, context?: RollContext): number }` — die-typed.
- `type RollContext = 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'heal' | 'hit-dice' | 'death-save' | 'other'` — labels a `NeedRoll` for UI prompts.
- `class NeedRoll extends Error { die; context }` — typed throwable.
- `class SeededRollProvider implements RollProvider` — wraps an `RNG`; reproduces `rollDie` bit-for-bit (the formula is inlined, one expression, with a pointer comment).
- `class SuppliedRollProvider implements RollProvider` — returns caller-supplied faces in order; throws `NeedRoll` when the queue is exhausted; validates each face is a legal `1..die` value (external input). Exposes `consumed`.
- Ambient scope: `withRollProvider(provider, fn)` installs `provider` for the synchronous `fn`, restores the previous one in `finally` (reentrant-safe); `getActiveRollProvider()`.

`rollDie` (and `rollDice` / `rollExpression`) now consult `getActiveRollProvider()`: with **no** provider it is the untouched `floor(next*die)+1` path; with a provider it routes the draw through it. An optional `context` arg was added and passed at the attack-roll, weapon-damage, and saving-throw sites (the Move+Attack milestone's labels); other sites pass `undefined` (best-effort labeling).

The engine exposes `engine.withRollProvider(provider, fn)`; the module functions + types are re-exported from the package barrel.

## Why this is safe (byte-identity + purity)

- **Byte-identity:** `rollDie`/`rollDice` are the *sole* RNG consumers in the plan path — verified: zero direct `rng.next()`/`rng.fork()` in `src/engine/plan`, `triggers`, `handlers`, `derive`. So with no provider the output is unchanged, and `SeededRollProvider` (same formula, same `SeededRNG`, same draw order) reproduces it bit-for-bit. The existing golden + replay-equivalence + rng-capture suites pass unchanged — the proof.
- **Resumable purity:** planning returns events with no side effects until `commit`, so a caught `NeedRoll` is resolved by re-attempting `fn` against a longer queue — the same value prefix re-draws identical earlier dice and advances exactly one more roll. Verified: a nat-20 requests the doubled damage dice; a nat-1 miss requests none; the loop converges either way.
- **Determinism scope:** manual dice are for the player's own actions in unranked play only, so a single shared stream is used. Per-combatant stream forking is a deliberate non-goal for now (future option). The ranked/daily path always uses `SeededRollProvider`.

## Files

- **[src/rng/roll-provider.ts](../../src/rng/roll-provider.ts)** (new): interface, contexts, `NeedRoll`, `SeededRollProvider`, `SuppliedRollProvider`, ambient `withRollProvider` / `getActiveRollProvider`.
- **[src/rng/dice.ts](../../src/rng/dice.ts)**: `rollDie`/`rollDice`/`rollExpression` route through the ambient provider; optional `context` param.
- **[src/rng/index.ts](../../src/rng/index.ts)**, **[src/index.ts](../../src/index.ts)**: re-export the new surface.
- **[src/engine/index.ts](../../src/engine/index.ts)**: `engine.withRollProvider` method.
- **[src/engine/plan/_attack-roll.ts](../../src/engine/plan/_attack-roll.ts)** / **[attack.ts](../../src/engine/plan/attack.ts)** / **[_save-roll.ts](../../src/engine/plan/_save-roll.ts)**: pass `'attack'` / `'damage'` / `'save'` contexts.
- Tests (new): [tests/unit/rng/roll-provider.test.ts](../../tests/unit/rng/roll-provider.test.ts) (9), [tests/unit/engine/roll-provider-attack.test.ts](../../tests/unit/engine/roll-provider-attack.test.ts) (5: byte-identity, reproduction, NeedRoll point, nat-20-doubles / miss-requests-none).
- [tests/contract/__snapshots__/exports.test.ts.snap](../../tests/contract/__snapshots__/exports.test.ts.snap): new public names (`-u`, diff = intended additions only).

## Public API (handoff)

```ts
interface RollProvider { roll(die: number, context?: RollContext): number }
type RollContext = 'attack'|'damage'|'save'|'check'|'initiative'|'heal'|'hit-dice'|'death-save'|'other'
class NeedRoll extends Error { readonly die: number; readonly context: RollContext | undefined }
class SeededRollProvider implements RollProvider { constructor(rng: RNG) }
class SuppliedRollProvider implements RollProvider { constructor(queue: readonly number[]); get consumed(): number }
function withRollProvider<T>(provider: RollProvider, fn: () => T): T   // also engine.withRollProvider
function getActiveRollProvider(): RollProvider | undefined
```

Resumable-prefix driver shape: `let q: number[] = []; for (;;) { try { return engine.withRollProvider(new SuppliedRollProvider([...q]), () => engine.plan.attack(state, intent)); } catch (e) { if (e instanceof NeedRoll) { q.push(promptUser(e.die, e.context)); continue; } throw e; } }`

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green (golden + replay-equivalence + rng-capture unchanged = byte-identity proof).
- No existing event schema changed.

## Audit (Uncle Bob)

- **Names**: `RollProvider` / `SeededRollProvider` / `SuppliedRollProvider` / `NeedRoll` say what they are; `withRollProvider` reads as a scope.
- **SRP**: the seam module owns only the provider abstraction + ambient scope; `rollDie` keeps its one job (consults the seam, else the formula).
- **DRY**: the face formula lives once in `rollDie`; `SeededRollProvider` inlines the same one expression with a pointer comment (kept inline only to avoid an rng-module import cycle).
- **No defensive noise**: the one validation (`SuppliedRollProvider` face range) guards genuine external input (player-typed dice), not an internal invariant.
- **Pattern-check**: confirmed `rollDie`/`rollDice` are the only RNG consumers in the plan path before routing, so the ambient seam captures all planning randomness; no call site left drawing around it.

## Open follow-ups

- Per-combatant RNG stream forking (deliberately deferred; one shared stream suffices for unranked manual dice).
- Context labels are populated at attack/damage/save sites; other roll sites pass `undefined`. Enriching the rest is incremental and additive.
