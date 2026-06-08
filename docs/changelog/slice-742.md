# Slice 742 — tests/docs: L7 SRD-complete floor audit + fuzz-to-L7

**Type:** Tests + docs (infra). No engine change. Capstone of the L7 SRD-complete cycle (slices 738-741).

## What changed

- **New `tests/audit/srd-l7-complete.test.ts` (22 tests)** — the CI-guarded L7 floor, modeled on `srd-l6-complete`. Sections:
  1. Base-class L7 features: Monk Evasion; Rogue Evasion + Reliable Talent (738); Barbarian Feral Instinct + Instinctive Pounce (741); Bard Countercharm (740); Cleric Blessed Strikes; Druid Elemental Fury (739); Sorcerer Sorcery Incarnate.
  2. The six subclass L7 features: Champion Additional Fighting Style, Oath of Devotion Aura of Devotion, Hunter Defensive Tactics, Life/Draconic/Fiend L7 spell grants.
  3. Planner + effect-kind presence (`planCountercharm`; `GrantReliableTalent`).
  4. Behavioral 6→7: a Wizard gains a 4th-level spell slot; a Rogue gains Reliable Talent (effect-stack flag).
  5. Spell-slot milestone: full casters → 4th-level slots, half-casters → 2nd-level, Warlock pact → 4th-level.
- **Fuzz matrix → L7** ([tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts)): `LEVELS` `[1..6]` → `[1..7]`; cell count 72 → 84 (84 × 30 seeds = 2,520 battles/run). The new L7 OfferChoices (Druid Elemental Fury, etc.) are resolved by the slice-737 robust `drainPendingChoices`. `FUZZ_MAX_LEVEL` already 20 (slice 737).
- **Docs**: [docs/status.md](../status.md) L1-L6 → L1-L7 / 2,520 battles / 4th-level slots; [docs/gaps-class-features.md](../gaps-class-features.md) closed the four L7 stubs (reliable-talent — also relabeled L7 from a stale L11; elemental-fury; countercharm — with the 2014→2024 text correction; instinctive-pounce).

## Verification

- `npx tsc --noEmit`: clean. `tests/audit/srd-l7-complete.test.ts`: 22/22. `tests/audit/fuzz-matrix.test.ts`: 85/85 (incl. the 84-cell enumeration). Full suite green.

## Audit (Uncle Bob)

- **Reuse**: mirrors the `srd-l6-complete` audit structure + helpers; the fuzz matrix is the same harness extended one level.
- **Honest floor**: pins what's wired (including the consumer-managed Instinctive Pounce marker and the Countercharm outcome planner) and the L7 slot milestone.
- **No behavior change**: additive tests + a matrix-level bump + docs; goldens / replay / rng-capture untouched (L1-L6 cells byte-identical).
