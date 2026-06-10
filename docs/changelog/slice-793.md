# Slice 793 — engine-applied 2024 background ability-score increase

**Type:** Engine derivation + schema field + validation helper. **Closes** the [L7 audit](../l7-completion-audit.md) blocker `background-ability-bonus` (Area 5).

## The gap + the ownership decision

The 2024 background grants a +2/+1 (or +1/+1/+1) ability-score increase, and `BackgroundSchema.abilityScoreIncreases` carried the `options` + `pattern` — but **nothing applied it**. A Sage's INT 15 derived as 15, not 17, dropping the build's defining number. The audit flagged this `[verify]`: engine-owned or consumer-baked?

The contract was consumer-baked today (`createPC`, the getting-started flow, and the fuzz harness all hand the engine **final** scores; the only engine-applied ASI was the level-up one). **Decision: make it engine-owned**, but **opt-in** so the change is backward-compatible.

## The fix

- **New `Character.backgroundAbilityIncrease?`** — the chosen allocation, a partial `{ ability: 1 | 2 }` record (e.g. `{ INT: 2, WIS: 1 }`). When present, `abilityScores` are the **base** (pre-background) scores; when absent, the character is byte-unchanged (existing callers that baked the bonus in are unaffected — no double-count).
- **Applied in `buildEffectStack`** (`src/derive/effect-stack.ts`): each allocated ability rides through the same `addAbilityScoreIncrease` accumulator as the `IncreaseAbilityScore` item primitive (slice 308), capped at **20** (the 2024 chargen ceiling). Because the whole derivation layer already composes through `effectiveAbilityScoreIncrease` — `computeDerivedCharacter`'s displayed scores, saves, checks, attacks, AC, spell DC — the increase is reflected **everywhere** for free, no per-derivation threading.
- **`validateBackgroundAbilityIncrease(character, content)`** (`src/derive/background-asi.ts`, exported) — an opt-in checker a consumer's chargen UI runs: the allocated abilities must be among the background's `options`, and the amounts must match the `pattern`. Returns human-readable issues (empty = valid). The engine *applies* leniently; this *validates*.

## Why opt-in rather than auto-apply-to-all

Auto-applying to every character would double-count the ~all existing characters that already carry final scores (and need a migration + a base-vs-final flag). The allocation field IS that flag: its presence means "these are base scores; apply the background ASI." A character without it gets nothing — so `createPC`, the golden transcripts, and the fuzz harness are untouched (confirmed: the full fast suite is green with only the new export added).

## Tests

- **New** `tests/unit/derive/slice-793-background-ability-increase.test.ts` (8): Sage INT 15 → 17 / WIS 13 → 14 through the engine's derive facade; opt-in (no allocation → base scores unchanged); the 20 cap (19 + 2 → 20); and the validator across legal +2/+1, absent, out-of-options (STR for a Sage), wrong pattern (+2/+2), and a +1/+1/+1 shape on a +2/+1 background.
- `tests/contract/exports.test.ts.snap`: +`validateBackgroundAbilityIncrease`.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (576 files, 4468 passed) — every existing character byte-unchanged.
