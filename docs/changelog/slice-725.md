# Slice 725 — tests/docs: L5 SRD-complete floor audit + fuzz-to-L5

**Type:** Test + doc infra (no engine/content change). Capstone of the L5 SRD-complete cycle (slices 718-724).

## What changed

- **New `tests/audit/srd-l5-complete.test.ts`** (24 tests) — the CI-guarded L5 floor, companion to the L1-L4 floors. Pins:
  - Extra Attack for the five martial classes (Fighter / Barbarian / Monk / Paladin / Ranger), plus the behavioral check that a L5 Fighter makes two attacks per Attack action.
  - 3rd-level spell slots for full casters, 2nd-level for half-casters (Paladin / Ranger), and Warlock Pact Magic at slot level 3.
  - The per-class L5 features wired this cycle: Bard Font of Inspiration, Sorcerer Sorcerous Restoration, Druid Wild Resurgence, Paladin Faithful Steed (effect-shaped); Cleric Sear Undead, Fighter Tactical Shift, Wizard Memorize Spell (planner-gated markers, with planner presence checked).
  - Behavioral: a Fighter leveling 4→5 via `engine.plan.levelUp` gains the second attack.

- **`tests/audit/fuzz-matrix.test.ts`**: `LEVELS` extended `[1,2,3,4]` → `[1,2,3,4,5]`; matrix cells 48 → **60** (5 levels × 4 shapes × 3 rests), so **1,800 battles per CI run** (30 seeds/cell). `drainPendingChoices` reaches L5 unchanged (no new level-up choices at L5). All cells complete without throwing — the end-to-end L5 certification.

- **`docs/gaps-class-features.md`**: the five L5 stubs are struck through and tagged with their closing slice — Sear Undead (720), Wild Resurgence (721), Faithful Steed (722), Tactical Shift (723, also corrected from a mislabeled L9 to L5), Memorize Spell (724).

## L5 cycle summary (slices 718-725)

The marquee L5 mechanics (Extra Attack, 3rd/2nd-level slots, Uncanny Dodge, Stunning Strike, Sneak Attack 3d6) were already wired; the cycle closed the real gaps:

| Slice | Feature |
|---|---|
| 718 | `RecoverResource` on short rest → Bard Font of Inspiration + Sorcerer Sorcerous Restoration (gated, floor(level/2)) |
| 719 | Warlock invocation count labels corrected to SRD |
| 720 | Cleric Sear Undead (Turn Undead radiant rider) |
| 721 | Druid Wild Resurgence (slot ↔ Wild Shape; new `SpellSlotsRegained` event) |
| 722 | Paladin Faithful Steed (Find Steed always prepared + free cast) |
| 723 | Fighter Tactical Shift (half-Speed no-provoke on Second Wind) |
| 724 | Wizard Memorize Spell (prepared-spell swap; new `PreparedSpellsChanged` event) |
| 725 | L5 floor audit + fuzz-to-L5 + gaps closures |

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. The L5 floor audit (24) + the L5 fuzz matrix (1,800 battles) pass.

## Audit (Uncle Bob)

- **Floor, not ceiling**: the L5 audit pins the marquee surface + the cycle's wired features; deeper edges (e.g. the per-tier invocation gain system) remain tracked, not claimed.
- **End-to-end**: the fuzz matrix exercises L5 characters in 1,800 random battles, catching cross-cutting regressions the per-feature tests can't.
- **Doc accuracy**: every closed stub is annotated with its slice; the Tactical Shift level error (L9 → L5) corrected against SRD 5.2.1.
