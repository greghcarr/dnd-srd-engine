# Slice 863 — jump distances (`computeJumpDistances`)

**Type:** Engine derive (additive, no behavior change to existing surfaces). Closes the [L7 audit](../l7-completion-audit.md) Area-8 quirk `no-jump-distance`.

## The gap

RAW (SRD 5.2.1):

> **Long Jump.** When you make a Long Jump, you leap horizontally a number of feet up to your Strength score if you move at least 10 feet immediately before the jump. When you make a standing Long Jump, you can leap only half that distance.
>
> **High Jump.** When you make a High Jump, you leap into the air a number of feet equal to 3 plus your Strength modifier (minimum of 0 feet) if you move at least 10 feet on foot immediately before the jump. When you make a standing High Jump, you can jump only half that distance.

Neither formula was modeled — a consumer had no engine source for jump reach.

## The fix

A new pure derive in `speed.ts`, exported from the package:

```ts
computeJumpDistances(input: GetEffectiveSpeedInput): JumpDistances
// { longJumpFeet, standingLongJumpFeet, highJumpFeet, standingHighJumpFeet }
```

- **Long Jump** = effective STR score; **standing** = ⌊half⌋.
- **High Jump** = `max(0, 3 + effective STR modifier)`; **standing** = ⌊half⌋.

It reuses `GetEffectiveSpeedInput` and reads the **effective** Strength — `effectiveAbilityScore` over the effect stack's floor / increase + any drain, the same score the armor-speed and Graze (slice 857) derives use — so **Gauntlets of Ogre Power** (STR 19) lengthen the jump. RAW each foot of jump costs a foot of movement; that's a positional/consumer concern (the consumer spends Speed against the distance), so the engine reports the distances only and doesn't gate movement here.

## What shipped

New 3-test `tests/unit/derive/slice-863-jump-distances.test.ts`: the four distances for STR 16 (long 16/8, high 6/3) and STR 8 (long 8/4, high 2/1); the High-Jump minimum-0 clamp at STR 3 (mod −4 → 0); and the effective-STR read — a STR-8 wearer of Gauntlets of Ogre Power jumps as STR 19 (long 19/9, high 7/3). Exported `computeJumpDistances` + the `JumpDistances` type from `src/index.ts` (and the `derive` barrel); the exports snapshot gains both (additive). Documented on the movement-derive line in `api-overview.md`.

## Verification

`npx tsc --noEmit` clean; new 3-test slice-863 green; exports snapshot regenerated (additive: `computeJumpDistances` + `JumpDistances`). No content / condition / behavior change to any existing surface. `npm run test:fast` (641 files, 4814 passed) + doc audits green.
