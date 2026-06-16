# Slice 883 — `ki-sorcery-point-undercount` is NOT A BUG (per-level counts verified at L6-7)

**Type:** Docs + guard test (no source change). Resolves the L7 audit Area-5 `[verify]` row `ki-sorcery-point-undercount` as **confirmed correct** — the slices 841/842/848/856/857 "stale finding" pattern.

## The question

The audit flagged a *possible* off-milestone undercount of Monk Focus (Ki) / Sorcerer Sorcery Points at L6-7 — "if the per-level formula isn't applied." RAW (2024 `classes.md`): *"Your Monk level determines the number of [Focus] points you have"*; Sorcerer's Font of Magic likewise grants Sorcery Points equal to the Sorcerer level (both from L2). The counts scale **per level**, not on milestones.

## What the engine actually does

It's correct. The pack grants both resources with a per-level formula, and the seed evaluates it against the **current** class level:

- Monk L2 `monks-focus` → `GrantResource { resourceId: 'ki', max: { kind: 'level', classId: 'monk' } }`.
- Sorcerer L2 `font-of-magic` → `GrantResource { resourceId: 'sorcery-points', max: { kind: 'level', classId: 'sorcerer' } }`.
- `seedResourcesFromContent` (`src/engine/seed-resources.ts:54-59`) evaluates that `Formula` with `classLevels` set to each class's current level — so a freshly-seeded **L6 Monk has 6 Focus** and an **L7 Sorcerer has 7 Sorcery Points**. It's a `{ kind: 'level' }` formula, never a frozen milestone value.

Empirically confirmed at L2/L6/L7 for both classes (max = level).

## Separate, by-design note

The level-up reducer (`level-up.ts`) doesn't auto-mutate `character.resources[].max` — since slice 675, `character.resources` is **consumer-seeded** state (`seedResourcesFromContent` is a consumer-called helper, idempotent so it won't clobber a partially-spent pool). A consumer that levels a character up must re-seed (or read the freshly-seeded max). That's the consumer-seed contract — not the "per-level formula vs milestone" question this row raised, and not an undercount in the formula itself.

## Guard

New `tests/unit/engine/slice-883-ki-sorcery-points-per-level.test.ts` (3 tests): Monk `ki` max = Monk level at L2/L6/L7 (2/6/7); Sorcerer `sorcery-points` max = Sorcerer level at L2/L6/L7; and a regression check that L6/L7 strictly exceed the L2 value (a milestone-table regression — freezing at the L2 grant — would fail this).

## Audit

- Struck `ki-sorcery-point-undercount`, marked `~~QUIRK~~ → NOT A BUG` (the `savage-attacker-feat-inert` / `half-caster-l1-slot` treatment).
- Rollup: **Area 5** `4 → 3` open / `7 → 8` closed / `0/1/3 → 0/1/2`; **Total** `35 → 34` open / `82 → 83` closed / `0/13/22 → 0/13/21`. "Updated through slice 883."

## Verification

Doc + test only; no source change. `npx tsc --noEmit` clean; the new guard passes (3 tests). `doc-size` + `doc-links` + `doc-counts` audits green (no count surface moved).
