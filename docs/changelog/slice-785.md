# Slice 785 — `planSpendHitDie`: the short rest's defining heal

**Type:** Engine primitive (new planner + facade method). Closes the [L7 audit](../l7-completion-audit.md) **structural blocker** `no-hit-die-spend-planner` (Area 8 — Exploration / non-combat), the first of the post-Area-1 structural blockers. No schema or reducer change — pure planner.

## The gap

The short rest's main benefit had **no API**. The durable pieces existed and were tested:

- `HitDieSpentEvent` (`src/schemas/events/resources.ts`) — carries `die`, `rolled`, `conMod`, `healed`.
- `applyHitDieSpent` (`src/engine/reducers/resources.ts`) — decrements a Hit Die and adds the heal (capped at max HP; no-ops the heal at 0 HP).

But there was no `planSpendHitDie`, so a consumer (dnd-web) could not heal on a short rest *through the engine*. The only ways to produce the event were to hand-build it — uncapturing the RNG roll and bypassing the RAW math — or to skip short-rest healing entirely. `planShortRest` only emits the rest envelope (`ShortRestStarted` / `ShortRestEnded` + resource recovery); spending dice is a separate, repeatable player choice.

## The fix

A new `src/engine/plan/spend-hit-die.ts` → `planSpendHitDie(state, content, rng, intent)`, surfaced as **`engine.plan.spendHitDie({ characterId })`** (wired through `plan/index.ts`, the `engine.plan` facade in `engine/index.ts`, and the `planIntent` dispatch table in `conveniences.ts`). It emits a single `HitDieSpent` event.

RAW (SRD 5.2.1 `rules-glossary.md`, "Short Rest"): *"For each Hit Point Die you spend in this way, roll the die and add your Constitution modifier to it. You regain Hit Points equal to the total (minimum of 1 Hit Point)."*

- **Roll capture.** `rolled = rollDie(die, rng)` — the heal now replays deterministically like every other RNG-bearing planner (the Second Wind template).
- **Die size.** Read from the spent class's `hitDie` (d6 Wizard … d12 Barbarian). The reducer decrements the **first class enrollment with dice remaining**, so the planner rolls *that same* enrollment's die to stay in lockstep with it.
- **Effective CON.** `conMod` is computed off the effective Constitution score (Amulet of Health floor, Ioun Stone increase, … compose through the same `EffectAccumulator` the saves use), not the raw sheet score.
- **Minimum 1.** `healed = max(1, rolled + conMod)` — the 2024 minimum-1-per-die rule (the schema permits 0; the planner enforces RAW).
- **Gates.** Throws if the character has no Hit Dice remaining, and if the character is at 0 HP (a dying/Unconscious creature can't take a short rest or spend dice — and the reducer would otherwise burn a die for 0 healing).

## Scope / deferred

- **Multiclass die *choice*** is the only RAW remainder: a multiclass character may choose *which* size die to spend, but the engine spends in class-array order (matching the existing reducer). Honoring an explicit choice would need a `classId` on the event + reducer; deferred, and noted in the planner. For the L1-7 audit scope (mostly single-class PCs) this is invisible.
- **No rest/encounter gate.** The engine doesn't model "currently resting" as state (consistent with Second Wind), so the consumer sequences one `spendHitDie` call per die between a short rest's start and end. Spending dice mid-combat is out-of-band by construction (you can't short-rest in initiative), not engine-enforced.

## Tests

- **New** `tests/unit/engine/slice-785-spend-hit-die.test.ts` (8): single `HitDieSpent` event shape (die / captured roll / CON mod / `healed = max(1, roll+mod)`); per-class die sizes (Wizard d6, Barbarian d12); minimum-1 clamp under a negative CON modifier; commit raises HP by the heal and spends one die; heal never overshoots max HP; multiclass spends the first-with-dice enrollment in class-array order; throws on no-dice and on 0 HP.

## Verification

`npx tsc --noEmit` clean; the new slice-785 suite green (8/8). No snapshot or public-barrel (`src/index.ts`) change — the planner is reached via the `engine.plan` facade, like Second Wind.
