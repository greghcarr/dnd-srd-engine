# Slice 734 — tests/docs: L6 SRD-complete floor audit + fuzz-to-L6

**Type:** Tests + docs (infra). No engine change. Capstone of the L6 SRD-complete cycle (slices 727-733).

## What changed

- **New `tests/audit/srd-l6-complete.test.ts` (28 tests)** — the CI-guarded L6 floor, modeled on `srd-l5-complete.test.ts`. Sections:
  1. Base-class L6 features: Fighter ASI (slice 727), Rogue 2nd Expertise, Monk Empowered Strikes, Paladin Aura of Protection, and the Barbarian/Cleric/Druid resource bumps + Ranger Roving.
  2. The eight subclass L6 features: Life Blessed Healer (731), Evoker Sculpt Spells (732), Land Natural Recovery (729), Fiend Dark One's Own Luck (730), Lore Magical Discoveries (733), Draconic Elemental Affinity (204), Open Hand Wholeness of Body (357), Berserker Mindless Rage (728, planner-gated marker).
  3. Planner + effect-kind presence (`planNaturalRecovery`, `planDarkOnesOwnLuck`, `planRage`; `GrantSculptSpells`, `GrantBlessedHealer`, `GrantUnarmedAsMagical`).
  4. Behavioral: a Monk leveling 5→6 — Empowered Strikes comes online (effect-stack flag flips).
  5. Spell-slot floor carries to L6 (3rd-level full caster, 2nd-level half caster, 3rd-level Warlock pact).
- **Fuzz matrix → L6** ([tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts)): `LEVELS` `[1..5]` → `[1..6]`; cell count 60 → 72 (72 × 30 seeds = 2,160 battles/run). `FUZZ_MAX_LEVEL` 5 → 6 ([scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts)); the two new level-up choices at L6 (Fighter ASI-6, Rogue Expertise-2) are the same OfferChoice shapes `drainPendingChoices` already resolves at L4/L1, so the fuzz reaches L6 unchanged. The L6 sweep ran clean across all 12 matrix shapes before the matrix bump.
- **Docs**: [docs/status.md](../status.md) and [README.md](../../README.md) updated L1-L5 → L1-L6 / 2,160 battles; [docs/gaps-class-features.md](../gaps-class-features.md) reconciled — the six subclass L6 stubs (slices 728-733) annotated as wired, and the Monk Empowered Strikes edition drift documented (see below).

## Known drift (tracked, not introduced here)

Monk L6 **Empowered Strikes** ships `GrantUnarmedAsMagical` — the **2014 "Ki-Empowered Strikes"** semantics (unarmed strikes count as magical for overcoming nonmagical resistance/immunity), pinned by the s207 golden. SRD 5.2.1 Empowered Strikes is instead the **optional Force-damage-type choice** ("Whenever you deal damage with your Unarmed Strike, it can deal your choice of Force damage or its normal damage type"). This is a pre-existing edition drift (slice 207), surfaced while auditing L6. The floor audit pins only that the row is *wired* (not the drifted semantics); the 2024 re-wire is the single open L6 correctness follow-up (needs an opt-in damage-type override on unarmed strikes + the s207 golden rewritten) and is deferred to its own slice because it changes combat behavior and a pinned golden.

## Files

- [tests/audit/srd-l6-complete.test.ts](../../tests/audit/srd-l6-complete.test.ts) (new).
- [tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts): L6 cells (72) + comment.
- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts): `FUZZ_MAX_LEVEL` 5→6 + comment.
- [scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts): `--level 1..6` docstring.
- [docs/status.md](../status.md), [README.md](../../README.md): L1-L6 / 2,160 battles.
- [docs/gaps-class-features.md](../gaps-class-features.md): L6 stub closures + Empowered Strikes drift note.

## Verification

- `npx tsc --noEmit`: clean. `tests/audit/srd-l6-complete.test.ts`: 28/28. `tests/audit/fuzz-matrix.test.ts`: 73/73 (incl. the 72-cell enumeration). doc-counts + doc-links green. Full suite green.

## Audit (Uncle Bob)

- **Reuse**: mirrors the `srd-l5-complete` audit structure + helpers; the fuzz matrix is the same harness extended one level.
- **Honest floor**: pins what's wired, not aspirational semantics — the Empowered Strikes drift is documented and tracked rather than blessed by the audit.
- **No behavior change**: additive tests + constant bump + docs; golden / replay / rng-capture untouched.
