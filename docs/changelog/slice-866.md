# Slice 866 — over-capacity Speed cap (≤ 5 ft)

**Type:** Engine derive (behavioral; additive — fires only for an over-capacity actor). Closes the [L7 audit](../l7-completion-audit.md) Area-8 quirk `over-capacity-speed-5` — the last arm of the carrying-capacity cluster (slices 865 + 866).

## The gap

RAW (SRD 5.2.1, rules-glossary "Carrying Capacity"):

> While dragging, lifting, or pushing weight in excess of the maximum weight you can carry, your Speed can be no more than 5 feet.

Slice 865 made the carry maximum size-scaled and gave `computeEncumbrance` a binary `overCapacity` flag, but nothing consumed it — a creature hauling more than it could carry still moved at full Speed. This is the *only* mechanical consequence the SRD attaches to exceeding the carry max, so closing it completes the model.

## The fix

`getEffectiveSpeedForMode` (the single chokepoint behind `getEffectiveSpeed` / `getEffectiveSpeeds` / the four non-walk aliases) now applies the cap as its last step:

```ts
const uncapped = Math.max(0, scaled + exhaustionPenalty);
const cap = overCapacitySpeedCap(input); // 5 when overCapacity, else undefined
return cap !== undefined ? Math.min(uncapped, cap) : uncapped;
```

- **Reads `computeEncumbrance(...).overCapacity`** (carried inventory weight > the size×STR×15 carry max). `GetEffectiveSpeedInput` already carries `{ character, content, itemInstances }`, so no signature change.
- **All modes.** RAW "your Speed" is general, so walk and the non-walk modes (fly / swim / climb / burrow) are all capped. The `matchWalkSpeed` recursion is idempotent under the cap (a capped walk feeds a capped climb).
- **Only lowers.** `Math.min` clamps a faster Speed down; a 0-set (Grappled / Restrained / Paralyzed) already returned 0 above the cap, so it stays 0.
- **Cheap early-out.** An empty inventory can't be over capacity, so the common combat path returns `undefined` without summing weights.

The cap is the last word — it clamps even a `set` override (Phantom Steed walk 100 → 5 when overloaded), matching the RAW reading that the carry penalty bounds your actual movement.

### Deferred (noted, not in scope)

**Boots of Striding and Springing** RAW exempt the wearer ("your Speed isn't reduced by you carrying weight in excess of your carrying capacity or wearing Heavy Armor"), but the item ships **inert** (`effects: []`), so there is no wired path to exempt yet — its full wiring (the Speed-30 floor + this and the Heavy-Armor-penalty exemption + the 10-ft jump) is a separate content slice. Same precedent as the slice-799 Heavy-Armor Strength penalty, which the inert Boots likewise don't yet exempt.

## What shipped

- `overCapacitySpeedCap` helper + the cap line in `getEffectiveSpeedForMode` (`src/derive/speed.ts`); imports `computeEncumbrance` (no cycle — `encumbrance.ts` doesn't import `speed.ts`).
- New 8-test `tests/audit/slice-866-over-capacity-speed-cap.test.ts`: walk capped to 5 over the max; uncapped at exactly the max and under it; the empty-inventory fast path; `getEffectiveSpeeds.walk` reflects the cap; a non-walk mode capped (an over-capacity Ghost's fly 40 → 5, `{ walk: 5, fly: 5 }`); an under-capacity flyer keeps fly 40; and the only-lowers invariant (a base Speed already ≤ 5 stays 5).
- No new export, condition, effect, or content — purely a behavioral close on an existing derive.

## Verification

`npx tsc --noEmit` clean; new 8-test slice-866 green. `npm run test:fast` (644 files, 4839 passed) — exactly +1 file / +8 tests over slice 865, confirming **zero golden cascade** (no existing scenario builds an over-capacity actor). doc-size + doc-links audits green. No content / condition / snapshot change.
