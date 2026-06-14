# Slice 856 — `half-caster-l1-slot` is NOT A BUG (stale 2014 finding)

**Type:** Docs + guard test + a defensive code comment (no behavior change). Resolves the [L7 audit](../l7-completion-audit.md) Area-5 `half-caster-l1-slot` row as a confirmed non-bug.

## The finding

The audit row read: *"A single-class L1 Paladin/Ranger shows a 1st-level slot (`ceil(1/2)=1`); RAW spellcasting starts at L2 (third-casters are guarded, half-casters aren't)."* The implied fix: add a `level < 2 → 0 slots` guard for half-casters, mirroring the third-caster `level < 3` guard.

## Why it's not a bug

The row cites the **2014** rule. In 2014, Paladins and Rangers gained the Spellcasting feature at **level 2**. The **2024** PHB — which SRD 5.2.1 follows — moved it to **level 1**.

Canon (`references/srd-markdown/classes.md`):

> #### Level 1: Spellcasting
> You have learned to cast spells through prayer and meditation... **Spell Slots.** The Paladin Features table shows how many spell slots you have...

and the Paladin Features table's **Level 1** row grants **2 first-level spell slots** (Prepared Spells: 2, Spell Slots L1: 2). The Ranger is the same shape.

So a single-class L1 Paladin/Ranger *should* have 2 first-level slots, and `casterLevelContribution` returning `ceil(1/2) = 1` → `FULL_CASTER_SLOTS[0] = [2,…]` is the **correct** answer — deliberately implemented in slices 564 (per-caster L1 spellcasting) and 574 (L1 invariants), and already pinned by `spell-slots.test.ts`, `tabulated-math`, `rules-truth`, and `srd-l1-invariants`.

The third-caster guard (`level < 3 → 0`) is correct because Eldritch Knights / Arcane Tricksters genuinely *do* gain Spellcasting at level 3 in 2024. The half-caster has **no analogous guard precisely because there is nothing to guard** — adding one would re-introduce the 2014 level-2 start, i.e. edition drift.

This is the same misread-the-edition pattern as slices 841 (`disease-generic-condition`) and 842 (`variable-ac-by-posture`).

## What shipped

- The audit row is **struck through** (`~~QUIRK~~ → NOT A BUG`) and a bullet added to **Confirmed correct / by-design**.
- A comment in `spell-slots.ts` (where the third-caster guard lives) records *why* there is no half-caster L1 guard, so a future refactor doesn't "fix" it back to 2014.
- New guard `tests/audit/slice-856-half-caster-l1-spellcasting.test.ts` (3): Paladin/Ranger are `half` casters; a single-class L1 Paladin/Ranger has exactly 2 first-level slots (and nothing higher); and the progression stays RAW above L1 (L2 → `[2,0,0]`, L5 → `[4,2,0]`).

The route I started — adding the `level < 2 → 0` guard — was tried and **reverted**: it broke 8 existing tests that explicitly assert L1 = 2 slots citing "SRD 5.2.1 grants Spellcasting at L1", which is exactly the canon. Those tests were right.

## Verification

`npx tsc --noEmit` clean; new 3-test slice-856 green; the slice-564/574 + `spell-slots` / `tabulated-math` / `rules-truth` tables stay green. Doc + test + comment only — no behavior change, no condition/count/snapshot change. `npm run test:fast` green.
