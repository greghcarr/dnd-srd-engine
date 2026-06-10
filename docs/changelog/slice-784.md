# Slice 784 — edition drift: Color Spray is the SRD 5.2.1 CON-save Blinded cone (not the 2014 HP-pool knockout)

**Type:** Engine edition-drift fix (content + a Blinded variant condition). Fourth and **final** item of the [L7 audit](../l7-completion-audit.md) Area 1 (edition-drift) sweep — Area 1 is now fully closed. No engine-code or API change.

## The bug

Color Spray shipped the **2014** `hp-pool-knockout` (6d10 + 2d10/slot HP pool → Blinded). SRD 5.2.1 ([`spells.md`](../../references/srd-markdown/spells.md)): *"Each creature in a 15-foot Cone originating from you must succeed on a Constitution saving throw or have the Blinded condition until the end of your next turn."* Level 1, Range Self, **Instantaneous** (no Concentration), no HP pool, no escalation.

## The fix

A plain save → timed-condition spell (simpler than Sleep — no concentration, escalation, or auto-succeed):

- **New condition `color-sprayed-blinded-active`** — carries the base Blinded effects directly (Disadvantage on the bearer's attacks; attackers have Advantage), the same shape `cockatrice-restrained-active` uses for Restrained, plus `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }`. The encounter sweep keys on `sourceCharacterId`, so it lifts at the end of the **caster's** next turn — RAW "until the end of your next turn." The auto-fail-sight-checks arm is the same deferred gap as base `blinded` (no sight-check predicate).
- **Color Spray pack entry** → `{ kind: 'save', ability: 'CON', conditionOnFail: 'color-sprayed-blinded-active' }` (Instantaneous / cone-15 / non-concentration were already correct).

A dedicated Blinded variant (rather than base `blinded`) is needed because the cast-spell save block stamps `autoExpiry` from the **condition definition**, and base `blinded` is shared (it must not carry a Color-Spray-specific duration).

## Notes

- The 15-ft **cone** target selection reuses the consumer-supplied `targetIds` seam (same as Sleep's sphere). The true cone→covered-creatures rasterizer is the separate Area-3 blocker (`aoe-shape-coverage`), unchanged here.
- `hp-pool-knockout` now has no SRD starter-pack user (Sleep + Color Spray were the only two, both corrected to their 2024 mechanics). It remains a valid authoring primitive (documented in [authoring-content-packs.md](../authoring-content-packs.md)) for consumer packs, so it is intentionally **not** removed.

## Tests

- **New** `tests/unit/engine/slice-784-color-spray-2024.test.ts` (4): pack shape; the condition carries Blinded effects + the 1-round turnEnd autoExpiry; cast → fail → `color-sprayed-blinded-active` applied; cast → success → no condition.
- `tests/unit/engine/spell-coverage.test.ts`: `color-spray` `hp-pool-knockout` → `save`.
- The `+1` condition count bumped in `getting-started.md` / `status.md` / `starter-pack-gaps.md` (160 total / 145 rider).

## Verification

`npx tsc --noEmit` clean; full `npx vitest run` green.
