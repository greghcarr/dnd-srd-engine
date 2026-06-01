# Archive: slices 565-566

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 572, to keep the live file under the 60 KB single-Read ceiling). These are the residual-cycle slices that closed Hex ability-disadvantage rider (565) and Favored Enemy Hunter's Mark wiring (566).

---

**Engine + content (slice 566): Favored Enemy Hunter's Mark wiring — pool-based free-cast (real RAW drift)**

Closes a real L1 Ranger RAW drift discovered while researching slice 565. Pre-slice Favored Enemy granted only the `hunters-mark` resource (`max: 2` at L1; recharging on Long Rest, bumped 3/4/5/6 at L5/9/13/17). Two RAW arms were unwired:
1. Hunter's Mark was NOT granted as always-prepared — RAW: "You always have the Hunter's Mark spell prepared." Pre-slice a Ranger had to explicitly add it to `preparedSpells` to cast.
2. The `hunters-mark` resource was inert: no engine path consumed it on a Hunter's Mark cast. The existing free-cast pattern (slice 486 `useFreeCast` + `preparation: 'oncePerLongRest'`) doesn't fit Favored Enemy's N-per-LR semantics (2 at L1, 3 at L5, etc.).

RAW (SRD 5.2.1 Ranger L1, Favored Enemy): "You always have the Hunter's Mark spell prepared. You can cast it twice without expending a spell slot, and you regain all expended uses of this ability when you finish a Long Rest."

**Schema** ([src/schemas/effects.ts](../../src/schemas/effects.ts)): new optional `freeCastResourceId?: string` field on the `GrantSpell` effect kind. Composes orthogonally with the existing `preparation` axis — a single `GrantSpell` entry can be `always-prepared` AND tie a pool to the spell.

**Effect-stack builder** ([src/effects/builder.ts](../../src/effects/builder.ts)): `addGrantedSpell` accepts + stores the new field; `grantedSpells()` exposes it in the read API; the `case 'GrantSpell'` projection passes it through.

**Cast-spell planner** ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- `useFreeCast: true` now looks for either an `oncePerLongRest` grant (slice 486 path) OR a `freeCastResourceId` grant (slice 566 pool path). The matched grant determines the event emitted on commit.
- On the pool path: validates `character.resources` contains the named resource AND `current >= 1`; the bypass implies `noSlotCost: true` (same as slice 486); and a `ResourceSpent { resourceId, amount: 1 }` event fires instead of `FreeCastUsed`. The existing `applyResourceSpent` reducer decrements `resource.current`; the existing `applyLongRest` reducer's `restoreResources` step restores it to max — no new reducer or event needed.
- Mismatched useFreeCast (no `oncePerLongRest` and no pool grant) now throws "no oncePerLongRest or pool-based grant for this spell" (slightly widened from slice 486's wording). The slice-486 test's regex updated to match.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Favored Enemy L1 gains `{ "kind": "GrantSpell", "spellId": "hunters-mark", "preparation": "always-prepared", "spellcastingAbility": "WIS", "freeCastResourceId": "hunters-mark" }` alongside the existing `GrantResource`. The L5/9/13/17 features only bump the resource max (not the grant entry) — one GrantSpell covers all levels because the resource pool itself grows.

**Tests** ([tests/unit/engine/slice-566-favored-enemy-free-cast.test.ts](../../tests/unit/engine/slice-566-favored-enemy-free-cast.test.ts), 7 cases): pack declaration for the GrantSpell + GrantResource pair; effect-stack projection shows Hunter's Mark in `grantedSpells()` with the freeCastResourceId; first useFreeCast emits ResourceSpent (NOT SpellSlotConsumed, NOT FreeCastUsed); after 2 free casts the third throws (depleted); a default cast (useFreeCast=false) consumes a slot (NOT the resource); useFreeCast on a spell with no free-cast grant throws.

**Audit:**
- **Names:** `freeCastResourceId` mirrors the slice-486 `useFreeCast` + `usedFreeCastSpellIds` naming axis; the pool path is named symmetrically (`once` vs `pool`) in the planner local.
- **DRY:** the slice-486 `useFreeCast` block grew one additional `else if` arm + one extra event-emit branch; no duplicate path machinery. The `applyResourceSpent` reducer is reused unchanged.
- **SRP:** schema add (1 optional field), builder thread-through (2 lines), planner widen (5-line block + 11-line event branch), content add (1 effect entry). Zero net new files in `src/` (engine code), 1 new test file.
- **Magic numbers:** `amount: 1` per ResourceSpent (RAW: "twice" = 2 charges, each cast consumes 1) — local-scope literal; extracting it would obscure the meaning.
- **at-threading:** the ResourceSpent reuses the slice-486 `at` resolution + the same `causedByEventId: declared.id`; single `nowIso()` per planner stays single.
- **Mechanical outcomes asserted:** pack declaration, granted-spell projection, ResourceSpent emission, slot bypass, no FreeCastUsed double-emission, depletion-throws, default-path slot consumption, no-grant throws.

**Pattern-check:** this is the first pool-based free-cast wiring; the slice-486 `oncePerLongRest` path was the only prior shape. Future N-per-LR or N-per-SR free-cast features (Cleric L20 Divine Intervention Improvement isn't this shape; closer analogs: a homebrew "2 free Magic Missiles per LR" feature) use the same pattern. The "real L1 RAW drift" framing is intentional: the slice 565 research surfaced this gap (no failing test had pinned it), and the close fits cleanly into the slice-486 architecture without disturbing existing free-cast users. The slice-486 test's regex was updated in the same commit so no stale assertion drifts.

---

**Engine + content (slice 565): Hex ability-disadvantage rider — third of three residual L1 drift closures**

Closes the third residual L1 spell drift surfaced by the post-cycle deep review. Pre-slice Hex applied a single `hexed-active` condition carrying only the damage rider (RAW: "extra 1d6 Necrotic damage on a hit"); the RAW ability-check disadvantage arm ("choose one ability when you cast the spell. The target has Disadvantage on ability checks made with the chosen ability") was unwired, with the condition's description acknowledging: "RAW also gives the caster Disadvantage on one chosen ability check (nested sub-choice not modeled; consumer carries the ability name out-of-band)."

RAW (SRD 5.2.1 Hex, Warlock L1): "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 Necrotic damage to the target whenever you hit it with an attack roll. Also, choose one ability when you cast the spell. The target has Disadvantage on ability checks made with the chosen ability."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Removed: the single `hexed-active` condition.
- Added: 6 ability-keyed variants `hexed-STR-active` / `hexed-DEX-active` / `hexed-CON-active` / `hexed-INT-active` / `hexed-WIS-active` / `hexed-CHA-active`. Each carries the existing target-side damage rider (`OnEvent` + `AddDamage 1d6 necrotic` filtered on `event.targetIsSelf && event.hit && event.attackerIsSource` — slice 88) PLUS a `SetAdvantage { on: { kind: 'check', ability }, mode: 'disadvantage' }` matching its named ability.
- Hex spell switched from `{ kind: 'buff', conditionId: 'hexed-active' }` to `{ kind: 'buff', casterChoosesVariant: { variants: [STR, DEX, CON, INT, WIS, CHA] } }`. The cast intent must now supply `casterChoice: { kind: 'variant', value: 'STR'|...|'CHA' }`.

**Pattern reused**: the `casterChoosesVariant` shape is the canonical way to express "RAW: caster chooses one of N variants at cast time" — established users include Bestow Curse (slice 367's 6 per-ability variants, same shape), Calm Emotions, Command, Enhance Ability, Enlarge/Reduce, Fire Shield, and Chromatic Orb (for damage type). No engine wiring is required; the existing `resolveVariantConditionId` planner helper (cast-spell.ts:302) drives the resolution.

**Tests** ([tests/unit/engine/slice-565-hex-ability-disadvantage.test.ts](../../tests/unit/engine/slice-565-hex-ability-disadvantage.test.ts), 22 cases):
- Pack declarations: Hex variant keys = [STR,DEX,CON,INT,WIS,CHA]; for each ability, the condition exists + ships the damage rider AND a SetAdvantage on `{ kind: 'check', ability }` with `mode: 'disadvantage'`; legacy `hexed-active` is removed.
- Per-ability cast → correct variant applied with sourceCharacterId = caster.
- Per-ability cast → target's matching ability check rolls with `used: 'disadvantage'`.
- Scope proof: hexed-STR-active does NOT affect DEX/CON/INT/WIS/CHA checks.
- Casting Hex without a `casterChoice` throws (the casterChoosesVariant gate is required).

Updated tests: [tests/unit/engine/plan-hex-target-side-rider.test.ts](../../tests/unit/engine/plan-hex-target-side-rider.test.ts) (2 cast call-sites now supply `casterChoice: { kind: 'variant', value: 'STR' }`; conditionId checks moved to `hexed-STR-active`). [tests/unit/engine/spell-coverage.test.ts](../../tests/unit/engine/spell-coverage.test.ts) hex entry updated. [tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap) re-snapshotted: `hexed-active` removed, 6 variants added.

**Audit:**
- **Names:** the 6 conditions follow the established `hexed-<ABILITY>-active` convention (mirrors slice 367's `cursed-ability-<ability>-active` Bestow Curse variants).
- **DRY:** the 6 condition entries are near-identical except for the SetAdvantage ability field; not factored further because content is JSON (no shared-effect-array primitive exists in the pack format).
- **SRP:** Pure content edit: 1 condition removed, 6 added, 1 spell mechanic restructured. No engine code touched.
- **Magic numbers:** none.
- **at-threading:** N/A (no new event-emission paths).
- **Mechanical outcomes asserted:** per-ability variant applied on cast; per-ability ability-check disadvantage fires; other ability checks unaffected (scope proof); no-choice path throws.

**Pattern-check:** the original `hexed-active` design baked the assumption "one chosen ability per cast" into the consumer side as out-of-band metadata. Slice 367 had already solved this exact pattern for Bestow Curse via per-ability conditions + casterChoosesVariant. Slice 565 applies the slice-367 pattern to Hex, closing the parallel. Future spells with "caster picks an ability at cast time" RAW (e.g. variants of Boon-style spells) reuse the same shape. The doc-counts audit's conditions-count guard caught the +5 net change (135 → 140) and the rider sub-count (120 → 125) automatically; both updated in [docs/getting-started.md](../getting-started.md), [docs/status.md](../status.md) (twice — overview row + dimension row), and [docs/starter-pack-gaps.md](../starter-pack-gaps.md).
