# Slice 722 — content: Paladin Faithful Steed (L5)

**Type:** Content (effect wiring). No engine change. L5 SRD-complete cycle; wires the slice-54 Paladin L5 stub.

SRD 5.2.1 Paladin L5 Faithful Steed: "You always have the Find Steed spell prepared. You can also cast the spell once without expending a spell slot, and you regain the ability to do so when you finish a Long Rest."

## What changed

The Paladin L5 `faithful-steed` feature gains a single effect:

```json
{ "kind": "GrantSpell", "spellId": "find-steed", "preparation": "oncePerLongRest", "spellcastingAbility": "CHA" }
```

That one grant covers both arms, reusing existing machinery:

- **Always prepared** — `effectiveSpellList` includes every `GrantSpell` regardless of preparation, so Find Steed is castable with a Paladin spell slot (a L5 paladin has 2nd-level slots; Find Steed is level 2).
- **Free cast once per Long Rest** — the `oncePerLongRest` preparation enables the cast-spell free-cast path (`useFreeCast` → `FreeCastUsed`, no slot consumed, tracked in `usedFreeCastSpellIds` and cleared by the long-rest reducer).

Find Steed is already a fully-wired summon spell in the pack (`summon` mechanic: AC 11 / 30 HP base / +10 HP per slot above 2nd / speed 60), so the cast summons the steed end-to-end.

## Files

- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Paladin L5 `faithful-steed` → `GrantSpell`.
- [tests/unit/engine/slice-722-faithful-steed.test.ts](../../tests/unit/engine/slice-722-faithful-steed.test.ts) (new): free cast summons without a slot; free cast is once per long rest (blocked second, reset after rest); also castable with a slot; a L4 paladin has no Find Steed.
- [tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap): `paladin L5 faithful-steed` now wired (`-u`).
- [tests/unit/engine/slice-346-subclass-l3-wires.test.ts](../../tests/unit/engine/slice-346-subclass-l3-wires.test.ts): the Oath of Devotion granted-spell assertions now include `find-steed` for L5+ paladins (Faithful Steed grants it regardless of oath) — pattern-check fallout, updated.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No engine change — reuses the GrantSpell + free-cast machinery (slices 212 / 486).

## Audit (Uncle Bob)

- **Reuse over new code**: one `GrantSpell` reuses `effectiveSpellList` (always-prepared) + the `oncePerLongRest` free-cast path; no Faithful-Steed-specific planner.
- **SRD-faithful**: always prepared + one free cast per long rest, CHA spellcasting.
- **No new surface**: content-only; the spell (Find Steed summon) was already wired.
