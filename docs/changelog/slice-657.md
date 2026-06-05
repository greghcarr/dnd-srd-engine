# Slice 657 — engine + content + schema: `partialShortFullLong` recharge primitive

**Type:** Schema extension + reducer fix + content corrections. Fifth slice of the L3 RAW-completeness push.

**Discovery during slice authoring**: the engine's pre-657 short-rest reducer didn't honor the recharge field at all — it only cleared pact slots. Every `recharge: 'shortRest'` in content was silently long-rest-only because the long-rest reducer's catch-all `resource.current = resource.max` was the only path that restored anything. So slice 640's earlier characterization of `shortRest` as "over-permissive" was actually wrong — it was under-permissive in practice. This slice fixes both gaps in one.

## What changed

### Schema additions

| Surface | Change |
|---|---|
| `RechargeSchema` | New enum value `'partialShortFullLong'` (RAW: 1 back on short, all on long). |
| `ResourceStateSchema` | New optional `recharge: Recharge` field. Default behavior (undefined) matches pre-657: no short-rest recharge. Opt-in for RAW correctness. |

### Reducer fix

`applyShortRestEnded` now walks `character.resources` and:
- `recharge === 'shortRest'`: fully restore to max (Action Surge, Ki, Second Wind, etc.).
- `recharge === 'partialShortFullLong'`: restore +1, capped at max (Channel Divinity, Wild Shape).
- Other recharges (`undefined`, `'longRest'`, `'turn'`, etc.): no-op on short rest.

Long-rest reducer unchanged (still restores all resources to max).

### Content corrections

All 8 Channel Divinity and Wild Shape `GrantResource` grants across Cleric (L2 + L6 + L18), Paladin (L3 + L11), and Druid (L2 + L6 + L17) updated from `recharge: 'shortRest'` to `recharge: 'partialShortFullLong'`.

### Audit pin updates

- L2 floor (slice 640): Channel Divinity + Wild Shape pin updated `'shortRest'` → `'partialShortFullLong'`.
- L3 floor (slice 650): Paladin Channel Divinity pin updated `'shortRest'` → `'partialShortFullLong'`.

## Back-compat

The slice ships **only the schema additions + reducer behavior**; existing test fixtures don't need updating because:
- `ResourceState.recharge` is optional — old fixtures without it default to `undefined`.
- The reducer treats `undefined` as a no-op (matches pre-657 behavior).
- Existing characters built via `createPC` + manual `resources: []` keep their long-rest-only semantics until consumers opt in.

**Behavioral change for opt-in only**: a consumer that explicitly sets `recharge: 'shortRest'` on a character's runtime resource (or that uses a newly-built character whose resources were populated from `partialShortFullLong` content grants) gets the new RAW-correct short-rest behavior.

## Files

- **[../../src/schemas/primitives.ts](../../src/schemas/primitives.ts)**: new `'partialShortFullLong'` enum value in `RechargeSchema`.
- **[../../src/schemas/runtime/character.ts](../../src/schemas/runtime/character.ts)**: new optional `recharge: RechargeSchema` field on `ResourceStateSchema`. Imports `RechargeSchema` from primitives.
- **[../../src/engine/reducers/rest.ts](../../src/engine/reducers/rest.ts)**: `applyShortRestEnded` walks character resources and honors recharge cadence.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: 8 GrantResource grants updated (Cleric/Paladin Channel Divinity tiers + Druid Wild Shape tiers).
- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**: Channel Divinity + Wild Shape pins updated. Recharge type widened to include `'partialShortFullLong'`.
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**: Paladin Channel Divinity pin updated. Recharge type widened.
- **[../../tests/unit/engine/slice-657-partial-recharge.test.ts](../../tests/unit/engine/slice-657-partial-recharge.test.ts)** (new): 6 tests
  - partialShortFullLong: +1 on short rest
  - partialShortFullLong: second short rest reaches max
  - partialShortFullLong: short rest doesn't exceed max
  - shortRest: full restore (Action Surge 0→1)
  - undefined recharge: no short-rest restore (back-compat)
  - Long rest still fully restores partialShortFullLong (regression).

## Tests

- `npx vitest run tests/unit/engine/slice-657-partial-recharge.test.ts`: 6/6 pass.
- `npx vitest run tests/audit/srd-l2-complete.test.ts tests/audit/srd-l3-complete.test.ts`: 72/72 pass.
- Full suite: green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Schema additive.** New enum value + new optional field; old persisted state parses with field absent.

**Behavior change** (deliberate, opt-in):
- Pre-657: short rest only cleared pact slots and short-rest trigger counters. All other resources only recharged on long rest.
- Post-657: short rest honors the new `recharge` field on `ResourceState`. Opt-in via explicit field. Default (`undefined`) preserves pre-657 behavior.

**Content change** (active in fresh-built characters): the 8 Channel Divinity / Wild Shape `GrantResource` grants now declare `'partialShortFullLong'`. If a future auto-populate path is wired (currently the consumer populates resources manually), characters built from these grants would get the new recharge behavior. Today, consumers populating resources manually need to set `recharge: 'partialShortFullLong'` explicitly to opt in.

**Audit pin shift**: slice 640's L2 floor and slice 650's L3 floor now expect `'partialShortFullLong'` for Channel Divinity + Wild Shape grants. A regression that reverts the content to `'shortRest'` would fail both audits.

## Audit (Uncle Bob)

- **Names**: `'partialShortFullLong'` says exactly what the cadence is (partial-on-short, full-on-long). The reducer comment cites RAW directly.
- **DRY**: the recharge field lives in one place (`ResourceStateSchema`). The reducer reads it; no parallel state to keep in sync.
- **SRP**: the schema addition does one thing (extend the enum + add a runtime field); the reducer fix does one thing (honor the field on short rest); the content sweep does one thing (8 grant updates).
- **Magic numbers / strings**: every cadence is a named enum value. The `+1` partial-recharge amount is the only number; that's the RAW-exact value ("regain one expended use").
- **Pattern-check**: search for other "rest cadence shipped but not honored" gaps:
  - The `RecoverResource` Effect schema (separate from `GrantResource`) declares `when: 'shortRest' | 'longRest' | ...`. That one IS honored — it's used by features like Bardic Inspiration's expended-die recovery. Different shape from GrantResource's recharge — RecoverResource is an active effect, recharge is a resource property.
  - The other obvious "should honor on short rest" cases are pact slots (currently handled separately in applyShortRestEnded) and second wind (now correctly handled via the new field if the consumer opts in).
- **Discovered-during-authoring**: the gap that `shortRest` was decorative was the single most consequential L3 RAW bug. Documented in this slice's narrative so future audits can spot similar "field shipped but not consumed" patterns.

## Open follow-ups

L3 RAW-completeness punch list (slice 657 of 8):

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654~~: Subclass-selection cascade. Landed.
- ~~655~~: Subclass spell-list scaffolding pin. Landed.
- ~~656~~: L3 multiclass build audit. Landed.
- ~~657 (this slice)~~: `partialShortFullLong` recharge primitive. Landed.
- **658**: Deflect Attacks counter arm.
- **659**: Primal Knowledge ability-substitution.
- **660**: Circle of the Land long-rest swap.

**Deferred (post-cycle)**:
- Auto-populate `recharge` on `ResourceState` when characters are built from content (today the consumer manually populates resources; a future engine slice could read `GrantResource.recharge` from the effect-stack and seed it). Mostly affects fresh-create paths.
- Migrate test fixtures across the rest of the engine to opt in to short-rest recharge (Action Surge, Ki, Second Wind, etc.). Each test that wants RAW-correct multi-encounter rest behavior needs to add `recharge: 'shortRest'` to its resource fixture. Audited gradually; no urgency since pre-657 behavior is the safer default.
