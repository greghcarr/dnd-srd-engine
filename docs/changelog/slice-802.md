# Slice 802 — Surprise gives Disadvantage on Initiative

**Type:** Engine planner (new consumer-coordinated intent field). **Closes** the [L7 audit](../l7-completion-audit.md) Area 4 divergence `surprise-not-in-initiative`.

## The gap

SRD 2024 replaced the old "surprised creatures skip their first turn" with a cleaner rule (`rules-glossary.md` "Surprise"): *"If a creature is caught unawares by the start of combat, that creature is surprised, which causes it to have Disadvantage on its Initiative roll."* `RollInitiativeIntent` had no surprise channel, so a surprised ambushee rolled Initiative straight.

## The fix

The engine has no stealth / awareness model — *who* is caught unawares is the consumer's call — so surprise is a **consumer-coordinated fact**, the same shape as positions and line of sight:

- New optional `RollInitiativeIntent.surprisedCombatantIds?: string[]`.
- `planRollInitiative` OR-s membership into the combatant's Initiative disadvantage: `hasDisadvantage = effects.advantageFor('initiative').disadvantage || surprised`. Advantage + surprise cancel to a straight roll via the existing advantage/disadvantage interaction (a Feral-Instinct barbarian who's also surprised rolls normally). Omitting the field is byte-unchanged.

The field flows through the `engine.plan.rollInitiative` facade automatically (it spreads the intent).

## Related arms (not this slice)

The glossary also gives Initiative Disadvantage to the Incapacitated and Advantage to the Invisible. Those are *condition*-driven (wire a `SetAdvantage { on: 'initiative' }` onto the `incapacitated` / `invisible` condition definitions) rather than a consumer fact — a separate small content follow-up.

## Tests

`tests/unit/engine/slice-802-surprise-initiative.test.ts` (2): the `InitiativeRolled` event exposes only the chosen `d20`, so disadvantage is proven structurally — for a fixed seed the first combatant takes `min(d1,d2)` when surprised vs `d1` when not, so surprised ≤ un-surprised across 119 seeds and strictly `<` on at least one (proving two dice rolled, lower kept); and the un-surprised path still reaches the top of the die range (a single d20).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (585 files, 4512 passed) — the default (no surprise) path is unchanged, so no initiative test or golden transcript regressed.
