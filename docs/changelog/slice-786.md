# Slice 786 — the AoE rasterizer: one canonical "who's in the cone/sphere?"

**Type:** Engine primitive (pure derivation) + canonical user (a read-layer query + `engine.query` facade method). The **seam half** of the [L7 audit](../l7-completion-audit.md) structural blocker `aoe-shape-coverage` (Area 3). Slice 787 wires the opt-in `aim` enforcement into `cast-spell`; together they close the blocker.

## The gap

There was **no shared cone/sphere/line/cube → covered-creatures rasterizer**. `cast-spell` applied damage/saves to exactly the `targetIds` it was handed, and the affordance layer's `aoePlacementPoints` returned *aim* cells, not *covered* cells. [engine-scope.md](../engine-scope.md) put it plainly: area target selection was "a spatial query in your app's hands." So every consumer hand-rolled the geometry — and *will* disagree with an expert's template on corner inclusion, cone width, and diagonals. A Fireball hitting the wrong squares is the single likeliest expert-caught error.

## The fix

A single canonical rasterizer, in two layers:

**`src/derive/aoe.ts` — `coveredCells(spec)` (pure geometry).** Maps an SRD area of effect (shape + size + origin/aim cells) to the grid cells it covers. Convention, chosen so there is exactly one answer:

- A cell is covered iff its **center** lies within the continuous shape — the standard VTT "template" model. This is deliberately distinct from the engine's range/placement gating, which stays on the chebyshev metric (a different question: can you reach the point, vs. which cells the template covers).
- **Origin inclusion** follows the SRD rules-glossary "Area of Effect" entries: Sphere + Cylinder include the point of origin; Cone, Cube, Line, and Emanation exclude it (override with `includeOrigin`).
- **Cone** width at distance *d* equals *d* (RAW): axial distance *t* ∈ (0, length] and perpendicular offset ≤ *t* / 2.
- **Cube**: an n×n block flush with the origin cell, extended toward the aim's dominant cardinal, centered on the perpendicular axis.
- **Cylinder** rasterizes as its circular base (height ⟂ to the 2D grid).

**`src/query/aoe.ts` — `creaturesInSpellArea(state, content, query)` (state-aware).** Given an area spell, the caster, and an aim point (in feet), returns the combatant ids the template covers **and** that have line of effect from the point of origin (a creature behind Total Cover inside the radius isn't hit). A placed radial shape (a ranged Sphere, e.g. Fireball) originates at the aim; a Self radial / Emanation and every directional shape (Cone/Line/Cube — all Self-range in scope) originate at the caster, with the aim fixing direction. No allegiance filter — AoEs hit friend and foe alike (RAW: Fireball catches your own party). Surfaced as **`engine.query.creaturesInSpellArea(...)`**. Degrades to `[]` for a non-area spell or an unpositioned scene (the standard spatial-query seam).

**`emanation` added to `SPELL_AREA_SHAPES`** — the sixth 2024 shape (an area extending from a creature in all directions, moving with it), so the rasterizer covers all six RAW shapes. No starter-pack spell authors it yet; the zone mechanic (positioned, stationary) explicitly rejects it, since an Emanation isn't a placed zone.

## What this does *not* do (yet)

`cast-spell` still applies saves/damage to the `targetIds` it's handed; the engine doesn't yet derive membership itself. Slice 787 adds an opt-in `aim` to `CastSpellIntent` that, when supplied, runs this rasterizer and enforces coverage engine-side. Until then, a consumer calls `creaturesInSpellArea` to GET the canonical ids and passes them as `targetIds` — already enough to stop the divergence.

## Tests

- **New** `tests/unit/derive/slice-786-aoe-rasterizer.test.ts` (18): per-shape geometry — sphere radius + excluded far corner + origin inclusion; cone wedge + width-grows-with-distance + aim direction + no-direction-empty; line straightness + width override; cube 3×3 block + origin exclusion; cylinder ≡ sphere; emanation excludes origin; `includeOrigin` override.
- **New** `tests/unit/query/slice-786-creatures-in-spell-area.test.ts` (8): placed sphere covers within radius / excludes just-beyond + distant caster; Self cone covers the wedge / excludes too-wide, past-length, and the origin caster; a creature behind an impassable wall (Total Cover) inside the radius is excluded; a burst centred on the caster catches the caster + a bystander (friend-and-foe); `[]` for a single-target and an unknown spell.
- `tests/contract/exports.test.ts.snap`: +`coveredCells`, `creaturesInSpellArea`, `AreaOfEffectSpec`, `SpellAreaQuery` (the new public surface).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (573 files, 4450 passed).
