# Slice 627 — Innate Sorcery advantage gates on Sorcerer-list spells (RAW class gate)

**Type:** Engine + tests.

Closes the slice-623 RAW deviation: advantage applied to ALL spell attacks while active; RAW says only Sorcerer spells. Invisible at pure L1; surfaces at multiclass (sorcerer/wizard casting Acid Arrow previously got the advantage).

## Fix

New `event.spellCastingClassId` fact threaded into `casterAttackFacts` in [../../src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts). `innate-sorcery-active`'s `SetAdvantage on:'attack'` gained a `condition: { kind: 'eq', path: 'event.spellCastingClassId', value: 'sorcerer' }` predicate. The slice-258 `predicatedAdvantages` infrastructure handles the rest. The +1 spell save DC arm stays unconditional (computeSpellSaveDC doesn't yet thread a per-event class).

## Tests

[../../tests/unit/engine/slice-627-innate-sorcery-class-gate.test.ts](../../tests/unit/engine/slice-627-innate-sorcery-class-gate.test.ts), 3 cases: single-class sorcerer + Fire Bolt → advantage; multiclass sorc/wiz + Acid Arrow (`castingClassId:'wizard'` override) → NO advantage; multiclass + Chromatic Orb (shared list) → advantage.

## Verification

`npx tsc --noEmit` clean, full suite green.

## Audit

- **Names**: `event.spellCastingClassId` matches existing `event.spellId` / `event.spellSchool` fact convention.
- **DRY**: predicate uses the existing `eq` + `path` shape (same as Agonizing Blast / Empowered Evocation).
- **Pattern-check**: swept for other "fires on any cast" effects needing class-gating. Empowered Evocation already gates on `spellSchool` (wizard-exclusive so class-implicit). No other open cases.

## Surfaced follow-up

`findCastingClass` picks the FIRST spellcasting class in `character.classes`, not the class whose list the spell is on. Multiclass casters consuming a class-exclusive spell get the wrong castingClassId (and wrong spellcasting ability for attack/DC). The slice 627 test pins the intent-override path; fixing `findCastingClass` to match concentration.ts's `findCastingClassForSpell` (walk classes against `spell.classes`) is a separate cleanup.

## Open follow-ups still tracked

- **Power Word Speed Zero autoExpiry** (slice 623 open).
- **Hellish Rebuke / Heroism / Searing Smite / Ensnaring Strike in fuzz dispatch** (slice 622/624 open): engine wired, fuzz coverage gap.
- **`findCastingClass` multiclass routing** (this slice surfaced).
