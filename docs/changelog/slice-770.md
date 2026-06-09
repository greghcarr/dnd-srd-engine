# Slice 770 — encounter-view surfaces hp.maxBonus

**Type:** Bug fix (query read-model). The one unfixed finding from the affordance-correctness sweep.

## Why

`buildEncounterView`'s `CombatantView.hp` reported `{ current, max, temp }` from `character.hp.max` raw, omitting `hp.maxBonus`. A combatant under a max-HP buff (Aid, Aspect of the Beast, …) has `current` that can exceed the base `max`, so a combat tracker rendering the view showed the unbuffed maximum and couldn't reconcile `current > max`. The character-sheet view already exposes the buffed max (`hpMaxBonus` / `effectiveHpMax`); the encounter-view didn't. The sweep flagged it (slice 761 doc) as a future enhancement.

## How

[src/query/encounter-view.ts](../../src/query/encounter-view.ts) — `CombatantView.hp` gains `maxBonus` (read from `character.hp.maxBonus`); the displayed maximum is `max + maxBonus`. Additive.

## Tests

[tests/unit/query/encounter-view.test.ts](../../tests/unit/query/encounter-view.test.ts) — a combatant with `hp.maxBonus: 5` (Aid) surfaces `{ max: 20, maxBonus: 5 }` so the buffed maximum is reconstructable.

Full `npx vitest run` green.

## Status

Closes the last noted finding from the affordance-correctness sweep (758-761). The affordance layer (correctness + completeness + the deferred reactions/actions/bonus-actions) is complete; remaining items are larger follow-ups (an `actionTargets` query, the post-hit Paladin's Smite *feature* affordance, more class-feature actions) tracked in the slice-764/768 docs.
