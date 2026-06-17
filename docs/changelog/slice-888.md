# Slice 888 — the Burning environmental Hazard (`no-environmental-hazards`)

**Type:** Content (one new condition reusing the slice-825 `recurringDamage` primitive). Closes the L7 audit Area-8 quirk `no-environmental-hazards`.

## RAW

rules-glossary "Burning" [Hazard]: *"A burning creature or object takes 1d4 Fire damage at the start of each of its turns. As an action, you can extinguish fire on yourself by giving yourself the Prone condition and rolling on the ground. The fire also goes out if it is doused, submerged, or suffocated."*

## What shipped

A generic **`burning`** condition (distinct from the spell-specific `acid-arrow-burning` / `searing-smite-burning` riders):

- `recurringDamage{ dice: "1d4", damageType: "fire", trigger: "turnStart" }` — the consumer applies the condition when something catches fire and ticks `engine.plan.tickRecurringDamage` at the bearer's turn-start.
- **No `autoExpiry`** — it persists until put out. The RAW extinguish (give yourself Prone + roll on the ground as an Action, or be doused / submerged / suffocated) is narrative; the consumer models it by removing the condition.
- `effects: []` — the `recurringDamage` is the whole behavior (the `acid-arrow-burning` shape).

Content only — no engine/schema/event change; reuses the shipped `recurringDamage` machinery.

## The rest of the hazard row (documented boundary)

The row bundled four hazards; the combat-relevant one (Burning) is now modeled. The others are explicitly out of the engine's core scope:

- **Dehydration / Malnutrition** are per-**day** downtime hazards. Their mechanical core is already expressible — a reversible Exhaustion level via the slice-887 `suffocationExhaustionLevels` counter pattern (Dehydration's *"can't be removed until the creature drinks the full amount"* is the same reversible shape), plus a DC 10 CON save for Malnutrition via the existing save machinery. But the per-day cadence + food/water tracking is consumer-owned: the engine doesn't model the in-game calendar (see [engine-scope.md](../engine-scope.md)).
- **Extreme Cold / Heat** is a Gameplay-Toolbox **variant** (optional DM rules), not the core rules-glossary.

## Tests

New `tests/unit/engine/slice-888-burning.test.ts` (3 tests): the condition's shape (`recurringDamage{1d4 fire, turnStart}`, no autoExpiry, `effects: []`); a tick deals 1d4 Fire to the burning creature; the condition persists across ticks (no self-expiry) until the consumer removes it.

## Counts

+1 condition (total `176 → 177`; rider `161 → 162`) — reconciled in getting-started / status / starter-pack-gaps. `burning` is `effects: []`-with-`recurringDamage` (like `acid-arrow-burning`), so the "carry mechanical effects" count is unchanged, and — being consumer-applied, not spell-applied — it doesn't enter the wired-spell coverage snapshot.

## Audit

- Struck `no-environmental-hazards` (Area 8 QUIRK).
- Rollup: **Area 8** `3 → 2` open / `11 → 12` closed / `0/0/3 → 0/0/2`; **Total** `30 → 29` open / `87 → 88` closed / `0/11/19 → 0/11/18`. "Updated through slice 888."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (662 files, 4922 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
