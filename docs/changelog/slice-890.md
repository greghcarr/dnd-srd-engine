# Slice 890 — multiclass-entry proficiencies (`multiclass-entry-proficiencies`)

**Type:** Engine (3 proficiency derivations) + schema field + content (per-class data). Closes the L7 audit Area-5 DIVERGENCE `multiclass-entry-proficiencies`.

## RAW

2024 "As a Multiclass Character" (per class): when you take a level in a class **other than your origin class** (the one chosen at character creation), you gain only a **reduced** subset of that class's proficiencies. Examples: Fighter → Martial weapons + Light/Medium armor + Shields (**not** Heavy); Barbarian → Martial weapons + Shields; Wizard / Sorcerer / Monk → nothing extra. And **no class grants saving-throw proficiencies on multiclass** — those come only from the origin class.

## What was wrong

The three proficiency derivations — `isArmorTrained` (`armor-training.ts`), `isWeaponProficient` (`attack.ts`), and the save-proficiency check (`save.ts`) — walked **every** class in `character.classes` and granted its **full** authored set. So a multiclass character over-granted: a Wizard 1 / Fighter 1 picked up Fighter's **Heavy armor** and **STR/CON saving throws**, none of which RAW grants on multiclass. (Slot math was already correct — that's a separate, already-right derivation.)

## The fix

`character.classes[0]` is treated as the **origin** class (full proficiencies); entries 1+ are multiclass entries (reduced). The consumer orders the array so the first entry is the class chosen at creation — the same consumer-snapshot contract the multiclass *prerequisite* validator (slice 810) already assumes (multiclass entry is snapshot-only, no planner gate).

- New per-class **`multiclassProficiencies: { armor, weapon }`** on the class schema (default `{ armor: [], weapon: [] }` — so Wizard/Monk/Sorcerer, which grant nothing on multiclass, need no authoring). Authored for the other 9 classes from the SRD.
- `isArmorTrained` / `isWeaponProficient` iterate `classes.entries()`: index 0 uses the full `armorProficiencies`/`weaponProficiencies`; index 1+ uses `multiclassProficiencies.armor`/`.weapon`.
- The save-proficiency check reads **only** `classes[0]`'s `savingThrowProficiencies`.
- Skill / tool / instrument choices granted on multiclass entry (Bard / Ranger / Rogue) stay consumer-resolved at build time, like the origin class's skill choices — they aren't class-derived in the engine (tool proficiency isn't read from the class at all; only `background.toolProficiencies` is).

Single-class characters are byte-unchanged (one class = the origin = full set).

## Tests

New `tests/unit/derive/slice-890-multiclass-proficiencies.test.ts` (4 tests): Wizard 1 / Fighter 1 (origin Wizard) has INT/WIS saves only (not STR/CON), Fighter-multiclass Light/Medium/Shield armor + Martial weapons but **not** Heavy; Fighter 1 / Wizard 1 (origin Fighter) has STR/CON saves + Heavy armor and the Wizard entry adds no saves; Barbarian multiclass grants Shields but not Light/Medium; single-class Fighter and Wizard are unaffected (regression).

Fallout was low and verified: no golden has a genuine multiclass character (the "multiclass" goldens are two *separate* single-class characters), and the multiclass property suite asserts slot math + proficiency *bonus*, not proficiency *proficiencies* — all 663 fast-suite files stay green.

## Counts

No content-count change — `multiclassProficiencies` is a new class-schema field (not a condition/effect/spell). `doc-counts` untouched.

## Audit

- Struck `multiclass-entry-proficiencies`; Rollup: **Area 5** `2 → 1` open / `9 → 10` closed / `0/1/1 → 0/0/1`; **Total** `29 → 28` open / `88 → 89` closed / `0/11/18 → 0/10/18`.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (663 files, 4926 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
