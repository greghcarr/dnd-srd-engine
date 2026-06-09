# Slice 774 — post-hit affordances: Paladin's Smite

**Type:** Engine query surface (additive). New `src/query/post-hit.ts` — the last deferred affordance.

## Why

Through slice 773 every class-feature affordance was wired except one: the post-hit Paladin's Smite *feature*. RAW 2024 — "When you hit a creature with a melee weapon or an Unarmed Strike, you can use a Bonus Action to expend a Paladin spell slot to deal Radiant damage" — it's a rider on a *specific attack the paladin just made*, and that shape fits neither existing surface:

- `bonusActions` is a turn-menu with no triggering attack in scope, so it can't know which hit a smite would ride (and the slot-level picker depends on the hit). It also deliberately excludes Smite (slice 768 noted `divine-smite` is the discoverable Bonus Action *spell*; this is the separate L2 *feature*).
- `castableSpells` surfaces the `divine-smite` spell, not the feature.

So post-hit needs its own seam, mirroring `reactionsForTrigger`: given the triggering event, enumerate the contextual options.

## How

[src/query/post-hit.ts](../../src/query/post-hit.ts):

- **`postHitOptions(state, content, encounterId, attackEvent)`** → `PostHitOption[]`. Returns `[]` unless the attack is a **melee hit by a paladin** (the only post-hit feature through L7). Otherwise the single option carries:
  - `slotLevels: number[]` — the Paladin spell-slot levels 1-5 still available (the consumer renders a level picker; the chosen level sets the smite's 2d8 + 1d8/level damage).
  - `enabled` / `reason?` reflecting the Bonus Action economy: a blocking condition, `not-your-turn` (a smite costs a Bonus Action, so it's unusable off an Opportunity Attack — there's no Bonus Action on another creature's turn), `bonus-action-used`, or `no-uses` (no slot remains).
- **`postHitIntent(optionId, attackEvent, { slotLevel, targetIsUndeadOrFiend? })`** → `PaladinsSmiteIntent`, reading `paladinId` / `targetId` / `triggeringAttackEventId` from the event. Throws on an unknown id. The consumer runs the result through `engine.plan.paladinsSmite` (dropping the `type` tag, which that method re-adds).

**Why no `useOption`-style executor:** unlike the bonus-action / general-action families, `paladinsSmite` is consumer-orchestrated post-hit and is **not** in the `planIntent` dispatch (it's in `EXCLUDED_FROM_DISPATCH`). The consumer invokes the planner method directly — no executor needed.

**Owner gate is RAW-correct, stricter than the planner.** `planPaladinsSmite` is lenient: it checks only paladin-exists + slot-available + `slotLevel` 1-5 (no melee / hit / turn check). The affordance must never surface a RAW-illegal smite (after a ranged hit, off-turn, or by a non-paladin), so `postHitOptions` gates on all of it. Everything it offers (`enabled`), the planner accepts — the affordance-family discipline.

Exposed as `engine.query.postHitOptions` ([src/engine/index.ts](../../src/engine/index.ts)); `postHitOptions` / `postHitIntent` + `PostHitOption` / `PostHitIntent` / `PostHitParams` exported via [src/query/index.ts](../../src/query/index.ts) and [src/index.ts](../../src/index.ts).

## Tests

[tests/unit/query/post-hit.test.ts](../../tests/unit/query/post-hit.test.ts):
- Offered after a melee hit, enabled, `slotLevels [1,2]` for an L5 paladin.
- `[]` on a miss, a ranged hit, and a non-paladin attacker.
- `no-uses` when every slot is spent; `bonus-action-used` after the Bonus Action is consumed; `not-your-turn` for an off-turn (Opportunity-Attack) hit; the blocking-condition id when incapacitated.
- **Planner fidelity:** the intent `postHitIntent` builds is accepted by `engine.plan.paladinsSmite` (radiant `DamageApplied` on the target); `targetIsUndeadOrFiend` carries through (omitted when unset); unknown id throws.

(Note: 2024 SRD gives Paladins Spellcasting from L1, so the no-slots case is exhaustion, not low level — the test over-spends every slot level.)

Full `npx vitest run` green; exports snapshot updated (`postHitOptions` / `postHitIntent` + the three types).

## Status

**The affordance program is complete.** Every legal action / bonus action / reaction / post-hit option through L7 is now discoverable from `engine.query.*`, each planner-faithful. No deferred affordances remain.
