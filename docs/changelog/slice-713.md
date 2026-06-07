# Slice 713 — engine: spell affordances (enriched castableSpells + legalSpellTargets)

**Type:** Engine read-layer (engine.query.*). Additive, pure, read-only; no event schema change. Interactive-play part 1 of the spell/bonus-action set (priority (a) + AOE points).

The dnd-web duel needs to populate a Spells menu from engine affordances and drive targeting without reimplementing spell rules. Adds two queries, both reading from spell content so the UI parses nothing.

## 1. Enriched `castableSpells`

Each entry now carries (in addition to `spellId` / `minLevel` / `levelOptions`):

- `castingTime: 'action' | 'bonus-action' | 'reaction' | 'other'` — parsed from `spell.castingTime` (so a UI buckets into Action vs Bonus vs Reaction menus).
- `rangeFeet: number | 'self' | 'touch' | 'unbounded'` — via `parseSpellRange` (`'unbounded'` = Sight / Unlimited / miles).
- `target` — discriminated: `{ kind: 'self' }` | `{ kind: 'creatures'; maxTargets; allow: 'enemies'|'allies'|'any' }` | `{ kind: 'point'; shape; sizeFeet }`. Derived from `spell.targeting` (AOE) + range (self) + the resolves classification.
- `resolves: 'attack' | 'save' | 'auto' | 'heal' | 'buff'` (+ `saveAbility` when `'save'`) — priority scan of `mechanicalEffects` (attack/weaponAttack → attack; save → save; heal/temp-hp → heal; auto-hit → auto; buff/remove-condition → buff; residual → auto).
- `concentration` — from `spell.concentration`.

Classification heuristics (documented in source): `maxTargets` defaults to 1 (content carries no target-count); `allow` is `allies` for heal/buff, `enemies` otherwise; an authored AOE (`targeting`) is always `point` (incl. self-origin cones, bucketed as area spells).

## 2. `legalSpellTargets(state, encounterId, casterId, spellId, slotLevel)`

Legal targets at a slot, honoring range + line of effect + target kind, discriminated to mirror the descriptor:

- `{ kind: 'self' }`
- `{ kind: 'creatures'; candidates: TargetCandidate[]; maxTargets }` — living combatants within `enforceableSpellRangeFeet` + LoE; **includes the caster for non-enemy spells** (Cure Wounds on self). Sorted nearest-then-id.
- `{ kind: 'points'; cells: Position[] }` — legal AOE placement cells in range + LoE (in-bounds, non-impassable), sorted (x,y). For self-origin cones the radius is the area size (approximate — a cone needs a direction; this returns candidate aim cells).

`slotLevel` is accepted for API symmetry + future slot-scaled targeting (the pack's range/targeting don't scale by slot today). Positionless mode returns all living others as candidates (mirrors `legalTargets`).

`legalTargets` is left byte-identical (the spell candidate logic is a separate helper); the 11 existing affordances tests confirm it.

## Files

- [src/query/affordances.ts](../../src/query/affordances.ts): enriched `castableSpells` + `legalSpellTargets` + helpers (`spellMetadata` / `creatureCandidatesInRange` / `aoePlacementPoints`).
- [src/query/index.ts](../../src/query/index.ts), [src/index.ts](../../src/index.ts): barrel exports (+ types `SpellCastingTime` / `SpellRangeFeet` / `SpellResolves` / `SpellTargetAllow` / `SpellTargetDescriptor` / `LegalSpellTargets`).
- [src/engine/index.ts](../../src/engine/index.ts): `engine.query.legalSpellTargets`.
- [tests/unit/query/spell-affordances.test.ts](../../tests/unit/query/spell-affordances.test.ts) (new): 12 tests (metadata for Fire Bolt / Cure Wounds / Hold Person / Shield / Healing Word / Fireball; legalSpellTargets self / single-creature in+out of range / beneficial-includes-self / AOE points + determinism).
- [docs/api-overview.md](../../docs/api-overview.md): documents the enriched entry + `legalSpellTargets`.
- [tests/contract/__snapshots__/exports.test.ts.snap](../../tests/contract/__snapshots__/exports.test.ts.snap): new public names (`-u`, intended additions only).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green (existing affordances tests confirm `legalTargets` unchanged). No event schema change.

## Audit (Uncle Bob)

- **UI reads, doesn't parse**: every field is content-derived; the UI never parses spell text.
- **Reuse**: range via the same `parseSpellRange` / `enforceableSpellRangeFeet` the cast-spell spatial gate uses (no second range parser).
- **Determinism**: candidates nearest-then-id; points (x,y); spells by id. Named constants reused (`SPELL_LEVEL_MAX`, `DEFAULT_CELL_SIZE_FEET`).
- **Byte-identity**: `legalTargets` untouched (own helper for spell candidates), confirmed by its existing tests.
- **Pattern-check**: the mechanic discriminants are hyphenated (`temp-hp` / `auto-hit` / `remove-condition`) — verified against the schema, not assumed.

## Open follow-ups (next slice)

- ~~`bonusActions(...)` enumeration + the generic `engine.plan.useOption(...)` dispatcher (interactive-play part (b)). Bonus-action spells are surfaced in `castableSpells` filtered by `castingTime === 'bonus-action'`.~~ **Closed by slice 714.**
- ~~Multi-target `maxTargets > 1` awaits a content target-count field.~~ **Closed by slice 716** (derived from the spell's own mechanics — beam-scaling cantrips + `auto-hit` darts; no new content field needed).
- ~~AOE point targeting for self-origin cones is approximate (direction vs point); refine if the consumer needs exact cone aiming.~~ **Resolved by slice 716 as consumer scope:** exact "which cells the cone covers" is the app's spatial query per [engine-scope.md](../engine-scope.md) ("Spell area target selection"). The engine returns candidate origin/aim cells (in range + LoE); it does not enumerate a specific cone direction's cells.
