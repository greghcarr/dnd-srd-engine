# Slice 835 — Shadow Strength Drain (ability-score-drain accumulator)

**Type:** Engine primitive (a new state field + event + the cross-cutting `effectiveAbilityScore` drain-param) + content (the Shadow's Draining Swipe). Closes the [L7 audit](../l7-completion-audit.md) `drain-undead-shadow` row — and the whole `drain-undead-arms` lineage.

## The gap

The Shadow's Draining Swipe drains a target's **ability score** (SRD 5.2.1, CR 1/2):

> **Draining Swipe.** *Melee Attack Roll:* +4, reach 5 ft. *Hit:* 5 (1d6 + 2) Necrotic damage, and the target's Strength score decreases by 1d4. The target dies if this reduces that score to 0.

Unlike the max-HP drain (one `hp.maxBonus` field, read in one place), an ability score feeds **~15 derivations**, so a correct drain has to subtract consistently across all of them.

## What shipped

### The accumulator + the drain param

- **`character.abilityDrain`** — a new per-ability accumulator (`Partial<Record<ability, number>>`), accumulated by a new **`AbilityScoreDrained`** event (+ reducer), restored on a Long Rest (`applyLongRestEnded` clears it — the 2024 default; the Mummy/Death-Dog "doesn't return" are the exceptions).
- **`effectiveAbilityScore`** gained an optional 4th **`drain`** param, applied **last** (after floor + increase) and clamped to `ABILITY_SCORE_MIN` (1) so `abilityModifier` stays in range (a fully-drained creature is dead anyway).
- **Threaded through each call site** (verified per the audit ask): the drain is passed at the **combat/derived** consumers — attack to-hit + damage + cleave, saving throws, ability checks, AC (DEX + ability-override), spell save DC + spell attack, the heavy-weapon STR gate, the armor-STR speed penalty, the Hit-Die-spend CON heal, the Monk Deflect Attacks DEX/WIS, and the character-sheet scores. It is **deliberately NOT** passed at the **build-time validators** — `multiclass-prereq` (13-in-primary entry check) and `level-up` (feat ability prereqs) — which read the innate score, since a transient combat drain must not block leveling.

### The on-hit rider + content

- New weapon flag **`drainsAbility { ability, dice }`**: on a hit, roll the dice, emit `AbilityScoreDrained`, and — RAW — emit `CreatureDestroyed` when `base − (cumulative drain) ≤ 0` (the STR-0 instant death). Only a `drainsAbility` weapon reaches this, so existing attacks consume no extra RNG and are byte-unchanged.
- Content: the previously-unmodeled **Shadow Draining Swipe** weapon (1d6+2 necrotic, `drainsAbility STR 1d4`) + the Shadow's `actions[0]`.

The Humanoid-slain-rises-as-Shadow on-kill spawn (1d4h) stays consumer/DM-managed, as with the Wight zombie.

## Docs / counts

New event + Character field (optional → migration-safe); +1 weapon → **239 → 240** (bumped the getting-started + starter-pack-gaps item citations). No new condition or effect kind.

## Tests

`tests/unit/engine/slice-835-shadow-strength-drain.test.ts` (6): `effectiveAbilityScore` subtracts the drain last and clamps to 1 (and floor-before-drain); the Shadow weapon drains STR 1d4 + the action is wired; a hit deals necrotic + drains STR (accumulating on `abilityDrain`) and the drained STR lowers a STR save; drains accumulate; a STR-1 target dies (`CreatureDestroyed`) when the drain hits 0; a Long Rest restores it.

## Verification

`npx tsc --noEmit` clean; pack-integrity + doc-counts + migrations green; `npm run test:fast` green (614 files, 4671 passed) — the cross-cutting `effectiveAbilityScore` change is opt-in (drain undefined for every existing character), so all save/check/AC/attack/spell-DC/speed/character-view conformance + golden suites are byte-unchanged.
