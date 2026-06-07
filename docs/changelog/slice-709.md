# Slice 709 — tests: extend the fuzz matrix to L4 (the L4 fuzz floor)

**Type:** Tests (audit hardening). No engine or content change. The L4 cycle's end-to-end runtime guard.

Extends [tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts) `LEVELS` from `[1, 2, 3]` to `[1, 2, 3, 4]` (slice 651 did `[1,2]→[1,2,3]`). The matrix is now **48 cells × 30 seeds = 1,440 battles per CI run** (~16s wall-clock):

- Levels: 1, 2, 3, **4**
- Shapes: 1v1 PC, 2v2 PC, 1v1 monster, 2v2 monster
- Rests: none, short, long

## Why this is meaningful L4 coverage

Each fuzz character is built at L1 and leveled to the target via `levelUpTo` → `planLevelUp` + `drainPendingChoices`. At L4, `planLevelUp` emits the slice-707 Ability Score Improvement `ChoiceRequired`; `drainPendingChoices` walks the full cascade (pick the ASI feat → the +2/+1 allocate choice → the ability picker) and resolves it, so every L4 fuzz character actually exercises the ASI choice path before fighting — plus Monk Slow Fall / Fighter Second Wind 3 at L4. The static floor audit (`srd-l4-complete`) proves the surface is present; this proves nothing explodes inside the planner / reducer / trigger pipeline when L4 characters take random turns.

All 1,440 battles complete without throwing.

## Files

- **[tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts)**: `LEVELS` → `[1,2,3,4]`; cell-count assertion 36 → 48; header + describe label updated.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run tests/audit/fuzz-matrix.test.ts`: 49/49 (48 cells + the enumeration check), ~16s.
- `npx vitest run`: green.
- No engine, content, or event schema change.

## Audit (Uncle Bob)

- **DRY**: the matrix is data-driven (`LEVELS × SHAPES × RESTS`); extending coverage is a one-element change plus the count assertion, exactly as slice 651 did for L3.
- **SRP**: this is the always-on runtime canary; per-feature correctness stays in the dedicated unit tests + the static floor audit.
- **Honest count**: the `.toBe(48)` enumeration test guards against a silent matrix-size drift.

## Open follow-ups

- Tag `0.7.0-alpha.0` ("L4 SRD complete") — the L4 floor audit is 20/20 and the L4 fuzz floor is green.
- Per-character feat-eligibility filter for the L4 ASI menu (Grappler's ability prerequisite) — carried from slice 707.
