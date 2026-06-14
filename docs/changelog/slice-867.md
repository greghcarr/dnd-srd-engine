# Slice 867 — climb / swim / crawl movement-cost surcharge

**Type:** Engine planner (behavioral; additive — fires only for a `'climb'` / `'swim'` / `'crawl'` move). Closes the [L7 audit](../l7-completion-audit.md) Area-8 quirk `climb-swim-crawl-cost`.

## The gap

RAW (rules-glossary), three parallel rules:

> **Climbing.** While you're climbing, each foot of movement costs 1 extra foot (2 extra feet in Difficult Terrain). You ignore this extra cost if you have a Climb Speed and use it to climb.
>
> **Swimming.** … each foot of movement costs 1 extra foot (2 extra feet in Difficult Terrain). You ignore this extra cost if you have a Swim Speed and use it to swim.
>
> **Crawling.** While you're crawling, each foot of movement costs 1 extra foot (2 extra feet in Difficult Terrain).

`planMove` accepted a `movementMode` ('walk' | 'fly' | 'climb' | 'swim') but only `'fly'` was load-bearing (Flyby OA suppression); `'climb'` / `'swim'` were inert, and there was no crawl path at all — a Prone mover was always auto-stood-up.

## The fix

`planMove` now charges a **+1 ft per geometric foot** surcharge for the three modes:

- **The Difficult-Terrain interaction falls out for free.** The engine's path cost (`findPath` over `movementCostAt`) already doubles Difficult-Terrain feet, so a flat +1 per *geometric* foot reproduces the RAW total: normal terrain `1 (base) + 1 (climb) = 2`/ft; Difficult Terrain `2 (already-doubled) + 1 (climb) = 3`/ft — exactly the "1 extra (2 extra in Difficult Terrain)" reading. The geometric distance comes from the path step count (`(path.length − 1) × cellSize`) for mapped moves, or the Chebyshev distance positionless.
- **Climb / Swim waive** the surcharge when the mover has the matching effective speed (`getEffectiveSpeedForMode(input, 'climb' | 'swim') > 0`) — so a Giant Spider, a Spider-Climbing rogue, or a Ring-of-Swimming wearer climbs/swims at no extra cost.
- **Crawl never waives**, and the new `'crawl'` movement mode keeps the mover **Prone**: it's the RAW alternative to standing up, so it pays the +1 ft/ft surcharge *instead of* the half-speed stand-up cost and emits no `ConditionRemoved(prone)`. A default (`'walk'`) move while Prone still stands the creature up, unchanged.
- The surcharge counts against remaining movement (an over-budget climb/swim/crawl throws, naming the surcharge), and is folded into `feetTraveled` so the reducer drains `feetMovedThisTurn` correctly.

`MovementMode` gains `'crawl'`; the extraction `movementCostSurcharge(mode, geometricFeet, character, content, state)` keeps `planMove` flat.

## What shipped

- `src/engine/plan/movement.ts`: the `movementCostSurcharge` helper, the geometric-distance computation in both the mapped and positionless branches, the `'crawl'`-aware stand-up/Prone handling, and the surcharge in the cost total + over-budget error detail.
- New 7-test `tests/unit/engine/slice-867-climb-swim-crawl-cost.test.ts`: a plain walk costs base distance; climb / swim without the matching speed double it; a Giant Rat (native Climb 30) pays no climb surcharge; a Prone walker stands up (half-speed) and sheds Prone; a Prone crawler stays Prone and pays the crawl surcharge with no stand-up; an over-budget climb throws.
- No new export, condition, effect, or content (the `MovementMode` union gains a member — the exports/types snapshots track names, not union shape, so they're unchanged).

## Verification

`npx tsc --noEmit` clean; new 7-test slice-867 green. `npm run test:fast` (645 files, 4846 passed — exactly +1 file / +7 tests over slice 866, confirming the default `'walk'`/`'fly'` path is byte-identical, zero regression). doc-size + doc-links audits green. No golden cascade (no combat golden moves in climb/swim/crawl mode).
