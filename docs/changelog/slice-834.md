# Slice 834 — Wight Life Drain (save-action max-HP drain)

**Type:** Engine extension (a save-action `onFail` arm + a shared-helper extraction) + content (the Wight Life Drain save-action). Advances the [L7 audit](../l7-completion-audit.md) `drain-undead-extra-arms` row — the Wight arm.

## The gap

The Wight's Life Drain is a **save-action** (not an attack roll), so slice 832's weapon `drainsMaxHp` flag couldn't carry it (SRD 5.2.1):

> **Life Drain.** *Constitution Saving Throw:* DC 13, one creature within 5 feet. *Failure:* 6 (1d8 + 2) Necrotic damage, and the target's Hit Point maximum decreases by an amount equal to the damage taken.

The max-HP-drain payload is identical to the Specter/Wraith — only the trigger differs (a failed save vs a hit).

## What shipped

- **`SaveActionSpec.onFail.drainMaxHp`** (boolean) — on a failed save, after the damage, reduce the target's Hit Point maximum by the post-mitigation damage taken, the same `life-drained` mechanism the slice-832 weapon `drainsMaxHp` uses (restored on a Long Rest).
- **Shared `planLifeDrainEvents` helper** (`src/engine/plan/_life-drain.ts`) — the rule-of-three. The cumulative remove-then-readd logic (one `life-drained` entry, summed delta, since `applyConditionApplied` dedupes by id) was inlined in `attack.ts` (slice 832); it now lives in one place driving **both** the attack on-hit drain (Specter/Wraith weapons) and the save-action `onFail.drainMaxHp` arm (Wight). `attack.ts` was refactored onto it (byte-compatible — the slice-832 test + the full fuzz goldens confirm). The literal `'life-drained'` stays in the helper so the pack-integrity engine-emitted-conditions scan keeps guarding it.
- **Content** — the Wight's **Life Drain save-action** (CON DC 13, 1d8+2 necrotic, `drainMaxHp`). The Wight already had its Necrotic Sword/Bow multiattack; this adds the third action.

## Still open (split out as `drain-undead-shadow`)

The Wight's Humanoid-slain-rises-as-Zombie spawn (24h) stays consumer/DM-managed (a delayed positional rise). The **Shadow Draining Swipe** (STR-score drain by 1d4, dies at STR 0, + a 1d4h Shadow spawn) needs a new ability-score-drain mechanism — tracked separately.

## Tests

`tests/unit/engine/slice-834-wight-life-drain.test.ts` (5): the Wight carries the Life Drain save-action (CON DC 13, necrotic, `drainMaxHp`); a failed save deals necrotic + drains max HP by the damage taken (no prior drain → no removal); a successful save does nothing; a second drain accumulates into one cumulative `life-drained` entry; a Long Rest restores it.

## Verification

`npx tsc --noEmit` clean; pack-integrity (`life-drained` still guarded) + the slice-832 attack-path test (refactor byte-compatible) green; `npm run test:fast` green (614 files, 4667 passed). No new condition or effect kind (reuses `life-drained`) → no doc-counts bump.
