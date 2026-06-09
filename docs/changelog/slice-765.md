# Slice 765 — reaction affordances: Stone's Endurance + Protection

**Type:** Engine query surface (additive). Wires two of the reactions slice 763 deferred, now that each can be made planner-faithful.

## Why

Slice 763 shipped the reaction-affordance layer (discovery + correlation) for Shield / Cutting Words / Uncanny Dodge / Counterspell, and deferred the rest to avoid shipping a *loose* affordance (the exact query/planner mismatch the whole effort fixes). Two of the deferred reactions can now be made faithful within the single-trigger-event model:

- **Stone's Endurance** — `hasStonesEndurance` (species + the giant-ancestry resource) is looser than the planner, which requires the *resolved* Stone's Endurance ancestry. `findGoliathAncestryChoice(c, state)` makes `owns` exact.
- **Protection** — needs the shield + the Protection Fighting Style + positional adjacency, all derivable from a single `AttackRolled` on an ally + state.

## How

[src/query/reactions.ts](../../src/query/reactions.ts):
- Widened the registry's `owns` to `(character, state, content)` and `correlate` to also receive `encounterId` (most entries ignore the extra args).
- **Stone's Endurance** (damage trigger): `owns = hasStonesEndurance(c) && findGoliathAncestryChoice(c, state) === 'stones-endurance'` (planner-faithful). Correlate: `{ goliathId, damageAmount, triggeringDamageEventId }` from the `DamageApplied`.
- **Protection** (attack-roll trigger): `owns = equipped.shield && buildEffectStack(...).hasProtectionFightingStyle()` (the gates `planProtection` enforces). Correlate from an `AttackRolled` on an **ally** (not self / not the protector's own attack), on a normal single-d20 attack, when the protector is within 5 ft of the attacked ally (chebyshev on positions; positionless → not offered, adjacency is consumer scope). Intent `{ protectorId, attackerId, triggeringAttackEventId }`.

## Tests

[tests/unit/query/reactions.test.ts](../../tests/unit/query/reactions.test.ts) — slice 765 block:
- Stone's Endurance: a Goliath who *resolved* the ancestry is offered it and the planner accepts; a Goliath with species + resource but **no resolved ancestry is NOT offered** (the deferred-bug fix — the looser predicate would have wrongly offered it).
- Protection: an adjacent shield-protector with the Fighting Style is offered Protection and the planner accepts; a protector >5 ft away is not offered; a shield-bearer without the Fighting Style doesn't own it.

Each correlated intent is dispatched to its planner and accepted (the fidelity bar). Full `npx vitest run` green.

## Status

Reaction coverage is now Shield / Cutting Words / Uncanny Dodge / Counterspell (763) + Stone's Endurance / Protection (765). Still deferred — each needs **cross-event** context a single trigger event can't carry, addressed next: Deflect Attacks (the attack event linked from the damage) and Countercharm (the Charmed/Frightened context the `SaveRolled` lacks); plus Opportunity Attack (a positional move trigger).
