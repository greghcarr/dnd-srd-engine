# Slice 685 — engine: range + line-of-sight enforcement on attacks and spells (Work item 3 of the spatial combat plan)

**Type:** Engine primitive — gates `plan.attack` and `plan.castSpell` on positions + map presence. **Final slice of the spatial combat support cycle (683-685).**

Closes Work item 3 of the user's spatial plan. With this slice, a positioned attacker / caster whose target is past the weapon's reach, past the spell's RAW range, or behind a wall (impassable terrain or closed door) is rejected at plan time. Pre-685 those intents would silently succeed.

Two new gates, both no-ops when the spatial context can't be resolved (positionless / map-less encounters) so pre-685 test fixtures keep passing without changes.

## What's wired

### `src/engine/plan/_spatial-gates.ts` (new)

Shared helpers consumed by both planners:

- `SpatialContext` interface: `{ map, doors, fromCell, toCell, distanceFeet }`.
- `resolveSpatialContext(state, actorId, targetId): SpatialContext | null` — returns null when ANY enforcement precondition fails (no active encounter, missing combatants, missing positions, no map). Calling planners treat null as "skip the gate."
- `assertLineOfSightForAttack(state, actorId, targetId, attackerName, weaponLabel)` — LoS-only check (range stays with the weapon-aware `assertWeaponInRange` in [../../src/engine/plan/attack.ts](../../src/engine/plan/attack.ts), which already honors reach property + rangeNormal/rangeLong).
- `assertWithinSpellRange(state, casterId, targetId, rangeFeet, casterName, spellLabel)` — combined range + LoE gate for spell casts. Throws when distance > range OR LoE blocked.
- `parseSpellRange(rangeStr): SpellRangeKind` — discriminated union over the RAW vocabulary:
  - `{ kind: 'self' }` — `"Self"`, `"Self (10-foot radius)"`. Range gate skipped.
  - `{ kind: 'touch' }` — `"Touch"`. Treated as 5 ft.
  - `{ kind: 'feet', feet: N }` — `"60 feet"`, `"120 feet"`, `"30 feet (10-foot-radius sphere)"`.
  - `{ kind: 'unenforced' }` — `"Special"`, `"Sight"`, `"1 mile"`, `"Unlimited"`. Engine can't gate spatially; consumers handle out-of-band.
- `enforceableSpellRangeFeet(kind): number | undefined` — collapses the union to "feet to gate on" or undefined for non-finite shapes.

### `src/engine/plan/attack.ts`

- `planAttack` calls `assertLineOfSightForAttack` immediately after the existing `assertWeaponInRange`. Range is unchanged (was already feet-coord-correct under the slice-684 convention); LoS is new.
- Throws with `"<attacker> cannot attack with <weapon>: line of sight blocked"` when the Bresenham ray between attacker and target hits an impassable cell or a closed/locked door.

### `src/engine/plan/cast-spell.ts`

- `planCastSpell` calls `assertWithinSpellRange` per target id (after slot-availability validation, before the Slow V/S fizzle gate).
- Self-targets (`targetId === intent.characterId`) are skipped — same-character self-cast is always in range.
- Spells whose range parses to `{ kind: 'self' }` or `{ kind: 'unenforced' }` skip the gate entirely.
- Throws with `"<caster> cannot cast <spell> at <target>: target is <N> ft away (spell range <M> ft)"` or `"... line of effect blocked"`.

## Scope decisions

- **Hard enforcement, not advisory**: per the user's plan ("Decide explicitly whether enforcement is hard (throw) when positions are present (recommended) versus advisory"). A consumer that knows it has positioned combatants gets a deterministic rejection rather than a silent success-with-bad-distance.
- **No-op when context can't be resolved**: matches the existing `assertWeaponInRange` shape (skips when no positions). Keeps all pre-685 tests passing without per-test refactors.
- **LoE aliased to LoS**: `hasLineOfEffect` is currently the same Bresenham helper as `hasLineOfSight` (see [../../src/derive/terrain.ts](../../src/derive/terrain.ts)). The magical-darkness / total-cover distinction is deferred to a future slice that splits the two.
- **Per-target enforcement, not per-cast**: a multi-target spell (Magic Missile, Eldritch Blast) is gated target-by-target. One out-of-range target rejects the whole cast (the planner throws on first violation). Could be relaxed to "drop bad targets, fire the rest" later, but the strict shape matches RAW (the caster selects targets they can see / reach).
- **No `assertWithinAttackRange` from the shared module wired into planAttack**: the attack site already has weapon-aware `assertWeaponInRange` (reach property, ranged rangeNormal/rangeLong). Re-using it avoids duplicating that logic. The shared module's `assertWithinAttackRange` stays available for callers that don't have weapon context (none currently).

## Files

- **[../../src/engine/plan/_spatial-gates.ts](../../src/engine/plan/_spatial-gates.ts)** (new): shared helpers + `parseSpellRange`. ~120 lines.
- **[../../src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)**: imports `assertLineOfSightForAttack`; calls it after `assertWeaponInRange` in `planAttack`.
- **[../../src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)**: imports `assertWithinSpellRange` + `parseSpellRange` + `enforceableSpellRangeFeet`; runs the per-target range/LoE loop after slot validation.
- **[../../tests/unit/engine/slice-685-spatial-range-los.test.ts](../../tests/unit/engine/slice-685-spatial-range-los.test.ts)** (new): 14 tests covering positioned-pass, melee-reach-throw, LoS-blocked-throw, positionless-skip on attacks; in-range-pass, out-of-range-throw, LoE-blocked-throw, positionless-skip, self-target-skip on spells; and the parseSpellRange + enforceableSpellRangeFeet unit cases.

## Tests

- `npx vitest run tests/unit/engine/slice-685-spatial-range-los.test.ts`: 14/14 pass.
- Full suite: 542 files / 4,140 passing + 173 skipped (was 541 / 4,126 post slice 684; +1 file / +14 tests). No regressions.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Behavior change for `plan.attack` and `plan.castSpell` when both actor and target have positions AND the location has a map.** Pre-685, an intent with a target past reach / range OR with a wall between would silently emit normal events. Post-685, the same intent throws at plan time. Consumers that rely on this fall through (synthetic transcripts that put combatants on a map but ignore geometry) will see new errors and must either: (a) populate positions consistently, or (b) drop the map from the location to opt out of enforcement. Positionless encounters (the majority of pre-685 tests) are byte-identical.

No RNG-stream shift: the gates throw before any d20 is rolled.

## Audit (Uncle Bob)

- **Names**: `assertLineOfSightForAttack` / `assertWithinSpellRange` / `resolveSpatialContext` / `parseSpellRange` / `enforceableSpellRangeFeet` are intention-revealing. The shared module is prefixed `_spatial-gates` to mark it as an internal planner helper.
- **DRY**: the spatial context resolution (positions → cells, doors lookup, distance) lives in `resolveSpatialContext` and is used by both attack and spell gates. The `parseSpellRange` discriminated union centralizes RAW-vocabulary handling (Self / Touch / N feet / Sight / Special / 1 mile / Unlimited) — adding a new RAW shape is one switch arm.
- **SRP**: `_spatial-gates.ts` does spatial validation; `attack.ts` does intent → events; `cast-spell.ts` does intent → events. Each module's job is single-step. The shared module knows nothing about weapons, spells, or actions — only about positions, distances, and LoS.
- **Magic numbers**: `TOUCH_REACH_FEET = 5` is the only constant. Cell size + range strings come from content/runtime.
- **Pattern-check**: searched the codebase for other "silent-on-position-mismatch" planner paths — opportunity-attack (`src/engine/plan/opportunity-attack.ts`) re-uses `resolveAttack` so it inherits both gates transparently. Movement (`planMove`) already has full pathing-based enforcement (slice 684). No other "geometry should gate but doesn't" call sites remain.

## Open follow-ups

Spatial combat support cycle (slice 685 of 3):

- ~~683~~: Combatant placement. Landed.
- ~~684~~: Pathfinding + shortest-path move cost. Landed.
- ~~685 (this slice)~~: Range + LoS enforcement on `plan.attack` and `plan.castSpell`. Landed.

**Cycle complete.** The dnd-web 2D top-down viewer can now synthesize a real combatant-position map, animate `CombatantMoved` events, and surface engine-thrown "out of range" / "line of sight blocked" errors directly to the player.

**Post-cycle deferred** (per the user's plan):
- Split `hasLineOfEffect` from `hasLineOfSight` (magical darkness, total cover) — deferred until the engine gets a "creature sees through magical darkness" sense.
- Disadvantage in the (normalRange, longRange] band for ranged weapons — deferred; the gate currently only enforces the hard cap.
- Drop-bad-targets-fire-the-rest for multi-target spells — deferred until a consumer asks; the strict throw-on-first-violation shape matches RAW more cleanly.
- Elevation / 3D distance — out of scope (the cycle is 2D-only by design).
