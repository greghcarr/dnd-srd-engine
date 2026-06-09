# Slice 759 — spell-target affordance fidelity (Spare the Dying + AOE encounterId)

**Type:** Bug fix (query affordance). Two `legalSpellTargets` correctness fixes from the affordance-layer sweep.

## Why

1. **The dying-target fix (757) was incomplete.** `legalSpellTargets` keyed `includeDefeated` on `resolves === 'heal'`, but `spellResolves` classifies a `stabilize` mechanic as residual `'auto'`. So **Spare the Dying returned zero legal targets** — even though its only valid target is a 0-HP creature, and the cast-spell planner (`planStabilizeMechanic`) requires exactly `hp.current === 0`. A consumer's target picker for Spare the Dying was empty for the one cast that matters.
2. **AOE placement read the wrong encounter.** `aoePlacementPoints` read `state.activeEncounterId` instead of the `encounterId` argument threaded through every sibling helper. For any query against a non-active (or not-yet-started) encounter, the caster wasn't found and the AOE cell list came back empty.

## How

[src/query/affordances.ts](../../src/query/affordances.ts):
- `includeDefeated = resolves === 'heal' || spell.mechanicalEffects.some((m) => m.kind === 'stabilize')` — a `stabilize` spell keeps 0-HP creatures in the candidate pool (it can target *only* them).
- `aoePlacementPoints` takes `encounterId` and reads `state.encounters[encounterId]`, matching `creatureCandidatesInRange` / `legalSpellTargets`.

Query-side only; planner + event shapes unchanged.

## Tests

[tests/unit/query/spell-affordances.test.ts](../../tests/unit/query/spell-affordances.test.ts) — new "slice 759" block:
- Spare the Dying's legal targets include a creature at 0 HP.
- AOE placement (`fireball`) returns cells on a positioned but **not-yet-started** encounter (`activeEncounterId` undefined) — fails without the encounterId fix.

(The 757 tests — heal includes the dying, Fire Bolt excludes it — stay green.)

Full `npx vitest run` green.

## Status

Closes the dying-target bug class across `legalSpellTargets`: heal (757) + stabilize (759). Note the empty-mechanic resurrection spells (Revivify, Raise Dead, Power Word Heal) target the *dead*, route through the Resurrect planner, and aren't wired through this creature-targeting path — out of scope here. Part of the affordance-correctness sweep (siblings: 758, 760, 761).
