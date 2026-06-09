# Slice 763 — reaction affordances (G1): discovery + trigger correlation

**Type:** Engine query surface (additive). Closes the biggest completeness gap the affordance sweep found: the entire reaction category was undiscoverable from `engine.query.*`.

## Why

A consumer could *drive* every reaction (the planners exist) but couldn't *ask* "which reactions can this combatant take, and against this trigger event, with what arguments?" It had to hardcode each reaction against the event stream. This adds the discovery + correlation layer, mirroring `bonusActions`/`bonusActionTargets`.

## How

New module [src/query/reactions.ts](../../src/query/reactions.ts), exposed on `engine.query.*`:

- `availableReactions(state, encounterId, combatantId)` → `ReactionOption[]` (`{ id, label, trigger, enabled, reason? }`). The reactions a combatant owns, each with its trigger kind (`attack-roll` / `damage` / `spell-cast`) and enabled/disabled (a blocking condition, or the reaction already spent this round → `reaction-used`). Discovery for a UI.
- `reactionsForTrigger(state, encounterId, reactorId, triggerEvent)` → `CorrelatedReaction[]` (`{ id, label, intent }`). The correlation helper: given a trigger **event** (an `AttackRolled` / `DamageApplied` / `SpellCastDeclared`), the reactions that apply, each with a **ready-to-commit typed intent** — params pre-filled from the event. The consumer dispatches by `intent.type` to the matching typed planner (`engine.plan.shield` / `cuttingWords` / `uncannyDodge` / `counterspell`) to get the rich outcome and commit the events.

One source of truth (the REGISTRY) so enumeration and correlation can't drift. Applicability reuses the proven decision predicates in [src/ai/reactions.ts](../../src/ai/reactions.ts) (`shouldShield` / `shouldCuttingWords` / `shouldCounterspell` / `hasUncannyDodge`) — the same logic the combat-fuzz reaction layer uses.

## Coverage (and the fidelity bar)

Wired, each **planner-faithful** (its `owns`/`correlate` matches what the planner accepts — verified by a test that dispatches every correlated intent to its planner and asserts no throw):
- **Shield** (attack-roll → the hit target, if +5 AC flips it),
- **Cutting Words** (attack-roll → a Bard with a Bardic die that can flip the hit),
- **Uncanny Dodge** (damage → a Rogue L5+),
- **Counterspell** (spell-cast → an arcane caster with Counterspell + a 3rd-level slot, against an enemy's leveled cast).

Deliberately **deferred** (the framework is ready; each needs more than a single trigger event + a class/prepared check, and shipping a loose affordance would recreate the query/planner mismatch this sweep is fixing):
- **Stone's Endurance** — the planner requires the *resolved* Giant Ancestry choice, not just species + the `giant-ancestry` resource (the `hasStonesEndurance` predicate is looser than the planner).
- **Protection** — positional adjacency + fighting-style detection.
- **Countercharm** — the `SaveRolled` doesn't carry that it was a Charmed/Frightened save.
- **Deflect Attacks** — needs the attack event linked from the damage.
- **Opportunity Attack** — a positional move trigger, not an event here.

## Files

- [src/query/reactions.ts](../../src/query/reactions.ts) — the module.
- [src/engine/index.ts](../../src/engine/index.ts) — `engine.query.availableReactions` / `reactionsForTrigger` interface + wrappers.
- [src/query/index.ts](../../src/query/index.ts) + [src/index.ts](../../src/index.ts) — re-exports + types (`ReactionOption`, `ReactionTriggerKind`, `ReactionIntent`, `CorrelatedReaction`).

## Tests

- [tests/unit/query/reactions.test.ts](../../tests/unit/query/reactions.test.ts) — discovery (owns + trigger kind; `reaction-used` and `incapacitated` disable; empty for a no-reaction class); correlation for Shield / Cutting Words / Uncanny Dodge / Counterspell with **every correlated intent dispatched to its planner and accepted**; negatives (no Counterspell on a cantrip or your own cast; nothing once the reaction is spent).
- Public-API exports contract snapshot updated (6 new symbols).

Full `npx vitest run` green.

## Status

Closes completeness gap G1 for the core reaction set, framework-ready for the deferred ones. The registry-driven `availableActions` (G2) is the remaining completeness gap.
