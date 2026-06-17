# Slice 892 — `l4-locate-creature` + `l4-hallucinatory-terrain` are NOT A BUG (out of engine scope)

**Type:** Docs + spell-coverage clarification (no source change). Resolves two L7 audit Area-2 rows as **out-of-engine-scope by design** — the savage-attacker / half-caster-l1-slot stale-finding pattern, applied to inherently DM-narrative spells.

## The question

Both spells ship `mechanicalEffects: []` ("casting produces no mechanical effect"). The audit asked whether that's a gap. It isn't — both are divination/illusion effects the engine deliberately doesn't model, per [engine-scope.md](../engine-scope.md).

## Locate Creature

RAW: *"You sense the direction to the creature's location if that creature is within 1,000 feet of you. If the creature is moving, you know the direction of its movement."* (Concentration, 1 hour.)

The directional sense needs **world geography + creature locations beyond the encounter grid** — exactly what the engine doesn't model (positions live inside encounters; the broader world is the consumer's / DM's). The "any thickness of lead blocks" clause is a DM adjudication. There's no engine-modelable mechanical combat effect, so `mechanicalEffects: []` is correct and an expert wouldn't expect the engine to resolve it.

## Hallucinatory Terrain

RAW: a 24-hour illusion making natural terrain look/sound/smell like other terrain; a creature can take the Study action to make an Investigation check vs the spell save DC to disbelieve. No mechanical combat effect — terrain *appearance* and the disbelieve adjudication are DM/consumer-owned. `mechanicalEffects: []` is correct.

## Why "out of scope," not "deferred primitive"

The prior `spell-coverage` skip reasons framed these as "sensor/scrying primitive not modeled" / "terrain primitive not modeled" — implying a future primitive could wire them. But the "primitive" would be a whole world-simulation subsystem (geography, creature tracking, terrain rendering) the engine deliberately excludes. So these are **out of scope**, not deferred. The skip reasons were refined to say so; the spell-coverage suite still guards them as `skip` (340 tests green).

## Audit

- Struck both rows, marked `~~QUIRK~~ → NOT A BUG (out of scope)`, citing engine-scope.
- Rollup: **Area 2** `5 → 3` open / `19 → 21` closed / `0/2/3 → 0/2/1`; **Total** `27 → 25` open / `90 → 92` closed / `0/9/18 → 0/9/16`. "Updated through slice 892." The Area-2 frontier is now just the three genuinely-mechanical rows (`l4-giant-insect`, `confusion-table-not-rolled`, `chromatic-orb-no-leap`).

## Verification

Doc + test-reason clarification only; no source change. `spell-coverage` (340 tests) + `doc-size` + `doc-links` + `doc-counts` green.
