# Slice 865 — 2024 Carrying Capacity model (size-scaled carry + binary over-capacity)

**Type:** Engine derive refactor (one non-additive export removal; no behavior change to combat). Closes two [L7 audit](../l7-completion-audit.md) Area-8 rows: `encumbrance-variant-2014` (DIVERGENCE) and `carry-capacity-size` (QUIRK).

## The gap

Two rows described the same stale encumbrance model:

- **`encumbrance-variant-2014`** — `computeEncumbrance` reported 2014 variant tiers (`unencumbered` / `encumbered` / `heavily-encumbered`, keyed off 5×STR / 10×STR thresholds) via an `EncumbranceLevel` type. SRD 5.2.1 (2024) has **no** such variant.
- **`carry-capacity-size`** — `computeCarryingCapacity` was a flat `STR × 15`, not size-scaled, and exposed no Drag/Lift/Push value. It was also a *second*, duplicated formula: `encumbrance.ts` carried its own copy rather than calling the carry source.

RAW (SRD 5.2.1, "Carrying Capacity"):

> Your size and Strength score determine the maximum weight in pounds that you can carry … Drag, Lift, or Push: You can push, drag, or lift a weight in pounds up to twice your carrying capacity. While dragging, lifting, or pushing weight in excess of your carrying capacity, your Speed can be no more than 5 feet.

So the model is: **carry max = STR × 15 × size factor**; **drag/lift/push = double**; and the **only** mechanical consequence of exceeding the carry max is the Speed ≤ 5 cap. Encumbrance is therefore binary — within capacity, or over it.

## The fix

**`src/derive/carrying-capacity.ts`** — `computeCarryingCapacity(character, content)` now scales the `STR × 15` base by a size factor and returns the matching push/drag/lift maximum:

```ts
const SIZE_CARRY_FACTOR = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 4, gargantuan: 8 };
// effectiveSize = Powerful Build ? oneSizeLarger(baseSize) : baseSize
// capacity = STR × 15 × SIZE_CARRY_FACTOR[effectiveSize]
return { capacity, pushDragLift: capacity * 2, breakdown };
```

- Size read from `sizeOverride ?? content.species.get(speciesId)?.size ?? 'medium'`.
- Goliath **Powerful Build** still counts one size larger (Medium → Large ×2) on top — unchanged semantic, now expressed through the shared size ladder.
- `CarryingCapacityResult` is `{ capacity, pushDragLift, breakdown }` (was `{ capacity, breakdown }`).

**`src/derive/encumbrance.ts`** — removed its own duplicated flat formula; it now calls `computeCarryingCapacity` for the single source of truth. The result is binary:

```ts
interface EncumbranceResult {
  carriedWeight: number;
  carryCapacity: number;
  pushDragLiftCapacity: number;
  overCapacity: boolean; // carriedWeight > carryCapacity
}
```

The `EncumbranceLevel` type and the three tier labels are gone. The Speed ≤ 5 consequence is **not** applied here — it couples to the speed derive and is the tracked follow-up `over-capacity-speed-5` (slice 866).

## What shipped

- `EncumbranceLevel` removed from `src/index.ts` + the `src/derive` barrel — the **only** non-additive export change (the exports snapshot loses that one type; `EncumbranceResult` stays, reshaped).
- New 12-test `tests/audit/slice-865-encumbrance-2024-model.test.ts`: the six size factors (Tiny 75 / Small·Medium 150 / Large 300 / Huge 600 / Gargantuan 1200 for STR 10); ×2 drag/lift/push; Powerful Build Medium→Large (Goliath STR 16 → 480); and the binary over/at/under-capacity flag exercised with real starter-pack musket weights (10 lb).
- Updated to the new shape (all green): `tests/unit/derive/slice-582-carrying-capacity.test.ts` (already `{ capacity }`-based — values unchanged), `tests/unit/derive/encumbrance.test.ts` (`.capacity` + `overCapacity`), `tests/boundaries/tabulated-math.test.ts` (`.capacity`), `tests/unit/query/character-sheet.test.ts` (`carryCapacity` / `overCapacity`).
- The character-sheet view passes `EncumbranceResult` straight through (no sheet snapshot serializes it), so no view/snapshot churn.

## Verification

`npx tsc --noEmit` clean; new 12-test slice-865 green; the four updated tests green; exports snapshot regenerated (drops `EncumbranceLevel`). `npm run test:fast` (643 files, 4831 passed) + doc audits (doc-size / doc-links / doc-counts) green. No content / condition / combat-behavior change.
