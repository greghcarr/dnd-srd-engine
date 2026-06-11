# Slice 832 — undead Life Drain (max-HP drain)

**Type:** Engine primitive (weapon flag + attack-planner arm + restoration) + content (the Specter / Wraith Life Drain weapons). Advances the [L7 audit](../l7-completion-audit.md) `drain-undead-arms` divergence — the max-HP-drain arm.

## The gap

Undead Life Drain (SRD 5.2.1) deals Necrotic damage and reduces the target's **Hit Point maximum** by the damage taken:

> **Life Drain (Specter, CR 1).** *Hit:* 7 (2d6) Necrotic damage. If the target is a creature, its Hit Point maximum decreases by an amount equal to the damage taken.
> **Life Drain (Wraith, CR 5).** *Hit:* 21 (4d8 + 3) Necrotic damage. If the target is a creature, its Hit Point maximum decreases by an amount equal to the damage taken.

This was entirely inert — and worse, the Specter and Wraith had **no weapon / action wired at all** (they were missed in the multiattack sweep). The reduction returns to normal on a Long Rest: the SRD doesn't say so on these entries, but the Mummy and Death Dog entries explicitly say theirs *"doesn't return to normal when finishing a Long Rest"* — so restoration-on-rest is the 2024 default, and Life Drain follows it.

## What shipped

### The mechanism

- **`WeaponDefinition.drainsMaxHp`** (boolean) — "the damage this weapon deals also reduces the target's HP maximum by the amount taken."
- **Attack planner** (`attack.ts`) — on a hit with `drainsMaxHp`, after the damage chain, it applies a **`life-drained`** condition carrying a negative `hpMaxBonusDelta` equal to the post-mitigation damage taken (`intercept.components` sum). The existing `applyConditionApplied` reducer lowers `hp.maxBonus` by that delta — no new reducer. Because that reducer **dedupes a condition by id**, cross-turn accumulation keeps **one cumulative entry**: read the existing `life-drained` delta, emit `ConditionRemoved` (reverses it) then `ConditionApplied` with the summed delta. The in-scope drainers strike once per turn, so there's no intra-attack prior entry to thread.
- **Restoration** (`planLongRest`) — emits a `ConditionRemoved` (which reverses the `hpMaxBonusDelta` via `applyConditionRemoved`) for each participant's conditions that `endsOn` `longRest` **and** carry a non-zero `hpMaxBonusDelta`, *before* `LongRestEnded` resets current HP. The precise gate leaves exhaustion / rage / other `longRest`-metadata conditions (no max-HP delta) untouched.
- **`life-drained` condition** — a marker (`effects: []`; the work is the event-stamped `hpMaxBonusDelta`), `endsOn: [{ longRest }]`, `stackable: false` (one cumulative entry).

### Content (each SRD-verified)

The previously-unmodeled **Specter Life Drain** (2d6 necrotic) and **Wraith Life Drain** (4d8+3 necrotic) weapons + their `actions[0]`. Both use `noAbilityModifierDamage` with the exact dice baked (`2d6`, `4d8+3`) so the damage — and therefore the drain — matches the SRD line regardless of the monster-weapon ability-mod gap (the to-hit reconstruction for DEX-based monster naturals is a separate, pre-existing issue affecting imp-sting et al., out of scope here).

## Still open (split out as `drain-undead-extra-arms`)

The **Wight** Life Drain is a CON-save action (needs the slice-828 save-action mechanism + a `drainMaxHp` arm on `onFail`) plus a 24h zombie on-kill spawn; the **Shadow** Draining Swipe is STR-score drain (a new ability-score-drain mechanism) + a 1d4h Shadow on-kill spawn. Both need machinery beyond the attack-roll max-HP drain.

## Docs / counts

New condition → conditions **166 → 167** (152 rider); +2 weapons → **237 → 239**. Bumped the conditions + items citations in getting-started / status / starter-pack-gaps. `life-drained` has no effects, so the wired-conditions coverage snapshot is unchanged.

## Tests

`tests/unit/engine/slice-832-undead-life-drain.test.ts` (4): the weapons carry `drainsMaxHp` + the condition ends on a Long Rest + the Specter/Wraith actions are wired; a Specter hit reduces max HP by the necrotic taken (no prior drain → no removal); a second drain accumulates into one cumulative `life-drained` entry (remove-then-readd); a Long Rest restores the max HP and clears `life-drained`.

## Verification

`npx tsc --noEmit` clean; pack-integrity (`life-drained` is an engine-emitted defined condition) + doc-counts green; `npm run test:fast` green (613 files, 4662 passed).
