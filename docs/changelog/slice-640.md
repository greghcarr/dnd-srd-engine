# Slice 640 — tests: L2 floor Section 3 recharge-cadence pin

**Type:** Tests (audit-only). Second of five L2 hardening slices.

Extends slice 639's max-value pin with a recharge-cadence pin on the same five resource-granting features. After this slice, a future content edit that silently flips a recharge value (e.g. someone changes Sorcery Points from `longRest` → `shortRest` to "make sorcerers more usable in dungeon-crawl games") trips CI in the same slice that drifts it.

## RAW vs engine reality

The engine's recharge model is **binary** (`'shortRest' | 'longRest'`). RAW for two of the five features is actually a *partial* recharge ("regain one expended use on a Short Rest, all on a Long Rest"). The engine can't model that exactly today; the binary choice is over-permissive (`shortRest`: all back on short) or under-permissive (`longRest`: nothing back on short).

| Class | Feature | RAW recharge | Engine model | Deviation |
|---|---|---|---|---|
| Fighter | action-surge | Short or Long Rest | `shortRest` | None — exact |
| Cleric | channel-divinity | 1/short, all/long | `shortRest` | Over-permissive on short rest |
| Druid | wild-shape | 1/short, all/long | `shortRest` | Over-permissive on short rest |
| Monk | monks-focus (Ki) | Short or Long Rest | `shortRest` | None — exact |
| Sorcerer | font-of-magic (sorcery-points) | Long Rest only | `longRest` | None — exact |

The two partial-recharge deviations (Channel Divinity, Wild Shape) are pre-existing engine limitations, not new bugs. The gaps-class-features.md docs flagged Wild Shape's recharge as a "pre-existing inconsistency" — that's because the previous gut read was "RAW says long-rest only with PB uses." Re-reading SRD 5.2.1 directly: RAW is the same partial-recharge as Channel Divinity. Both features use the over-permissive `shortRest` arm in content, which the audit now pins.

**No content change in this slice.** A future slice that introduces partial-recharge as a first-class engine primitive (e.g. `recharge: 'partialShortFullLong'`) would unlock RAW-exact modeling for both features; the audit would change to expect that value in the same slice.

## Files

- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**:
  - `RESOURCE_BEARING_L2_FEATURES`: extended each row with a `recharge: 'shortRest' | 'longRest'` field. Added a header comment block enumerating the RAW-vs-engine deviations per feature.
  - Section 3 test body: appended a `recharge` assertion after the max-value assertion. Test title now reads `${classId} / ${featureId} ships GrantResource (${resourceId}) with L2 max = ${l2Max}, recharge = ${recharge}` so a failing assertion names the file, the feature, the resource, and both pinned values.

## Tests

- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (Section 3 size unchanged at 5 tests; each now pins three things).
- Full suite: unchanged from slice 639.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit strengthening. No content or engine change.

## Audit (Uncle Bob)

- **Names**: the `recharge: 'shortRest' | 'longRest'` field is the canonical engine type for the GrantResource recharge slot, so the audit's expectation matches the schema vocabulary directly. The header comment names the RAW behavior and the deviation arm for each row.
- **DRY**: same single-table-row pattern as slice 639. Adding a sixth resource at L2 is one row append; the assertions handle both the literal-max and Formula-max branches uniformly.
- **SRP**: Section 3 now pins three things about each L2 resource (existence, max, recharge), all rooted in the same `findL2Feature(classId, featureId).effects` lookup. No new state.
- **Magic numbers / strings**: every value lives in the table row. The deviation note in the header is documentation, not duplicate state.
- **Pattern-check**: the same partial-recharge limitation will surface again for L3+ resources (Hit Dice are partial-recharge in RAW too). When the engine introduces a `partialShortFullLong` recharge primitive, this audit and the equivalent L1 / L3+ floors all need to swap their pinned values for the affected features — track via a single open follow-up below rather than scattering it.

## Open follow-ups

L2 floor hardening punch list (slice 640 of 5):

- ~~639~~: Resource max-value pin. Landed.
- ~~640 (this slice)~~: Recharge cadence pin. Landed.
- **641**: Spell wiring floor enforcement (pin per-level wired/narrative/deferred at the current L2 floor).
- **642**: Multiclass L2 audit.
- **643**: L2 fuzz floor.

Deferred engine work (cross-feature):
- **Partial-recharge primitive**: add `recharge: 'partialShortFullLong'` (or `recharge: { onShort: 1, onLong: 'all' }`) to the GrantResource schema + rest reducer. Unlocks RAW-exact modeling for Cleric Channel Divinity and Druid Wild Shape; would also retroactively fix the gaps-class-features.md "pre-existing inconsistency" entry. Not a release blocker for `v0.3.0-alpha.0` since the engine is at alpha quality and over-permissive shortRest doesn't break play — it just hands out free uses on short rests.
