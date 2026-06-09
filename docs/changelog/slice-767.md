# Slice 767 — reaction affordances: Deflect Attacks + Countercharm (cross-event correlation)

**Type:** Engine query surface (additive). Completes the reaction-affordance layer with the two reactions that need **cross-event** context.

## Why

Deflect Attacks and Countercharm were the last deferred reactions. Each needs information a single trigger event doesn't carry:
- **Deflect Attacks** reduces the damage of an *attack*, but `DamageApplied` has no link to the `AttackRolled` that caused it (and `reactionsForTrigger` only had `state`, not the log).
- **Countercharm** rerolls a *failed save against being Charmed/Frightened*, but `SaveRolled` doesn't record which condition it gated, and `ConditionApplied` doesn't carry the save's DC / ability / bonus.

## How

`reactionsForTrigger` gains an optional **`recentEvents: ReadonlyArray<Event>`** param (the consumer's recent log slice) for cross-event correlation; the registry's `correlate` receives it. Every other reaction ignores it (reads only the trigger event), so the param is purely additive and backward-compatible.

[src/query/reactions.ts](../../src/query/reactions.ts):
- **Deflect Attacks** (`damage` trigger, Monk L3): correlate when the reactor is the damaged target and the damage has a deflectable physical type (`dominantPhysicalType` over the components), scanning `recentEvents` for the most recent `AttackRolled` targeting the reactor → `triggeringAttackEventId`. Without `recentEvents` (or for non-physical damage) it doesn't correlate.
- **Countercharm** (new `condition-applied` trigger → `ConditionApplied`, Bard L7): correlate when the applied condition is Charmed/Frightened, scanning `recentEvents` for the preceding failed `SaveRolled` for the same target → the reroll's `ability` / `dc` / `saveBonus`. 30 ft range is consumer-managed (refined here when positions are known). On a successful reroll the consumer removes the just-applied condition (the slice-752 pattern).

Both planner-faithful — each correlated intent is dispatched to its planner in the tests and accepted.

## Tests

[tests/unit/query/reactions.test.ts](../../tests/unit/query/reactions.test.ts) — slice 767 block: Deflect correlates from physical attack damage + `recentEvents` (planner accepts; `triggeringAttackEventId`/`damageType` correct), and does NOT without `recentEvents` or for non-physical damage; Countercharm correlates from a Charmed `ConditionApplied` + the preceding failed save (planner accepts; DC/ability/bonus filled), and does NOT without the save or for a non-charm condition.

Full `npx vitest run` green.

## Status

**The reaction-affordance layer is complete** — all nine reactions wired and planner-faithful across the attack-roll / damage / spell-cast / leaves-reach / condition-applied triggers: Shield, Cutting Words, Uncanny Dodge, Counterspell (763); Stone's Endurance, Protection (765); Opportunity Attack (766); Deflect Attacks, Countercharm (767). Remaining deferred work is non-reaction: the bonus-action deferrals (Paladin's Smite / Conjure Pact Weapon / Clouds Jaunt) and the class-feature actions (Action Surge / Turn Undead / …).
