# Slice 732 — engine: Wizard Evoker Sculpt Spells (L6)

**Type:** Engine feature (new effect kind + cast-spell save hook). Additive, opt-in. Wires the Evoker L6 stub. L6 SRD-complete cycle.

SRD 5.2.1 Evoker L6 Sculpt Spells: "When you cast an Evocation spell that affects other creatures that you can see, you can choose a number of them equal to 1 plus the spell's level. The chosen creatures automatically succeed on their saving throws against the spell, and they take no damage if they would normally take half damage on a successful save."

## What changed

- New flag effect **`GrantSculptSpells`** (the `GrantPotentCantrip` marker pattern): surfaced as `effectStack.hasSculptSpells()`.
- `CastSpellIntent` gains an optional `sculptedTargetIds: ReadonlyArray<string>` — the creatures the caster excludes from an Evocation save spell.
- `planSaveMechanic` validates the request once (intent-revealing throws) and then skips each excluded target in the per-target loop, so a sculpted creature gets **no save event, no damage, and no forced movement** — the observable form of "automatically succeed + take no damage."
- Pack: the `sculpt-spells` Evoker L6 feature gains `{ kind: 'GrantSculptSpells' }`.

### Modeling choice: full exclusion

RAW's "auto-succeed + no damage" is, for every SRD save spell shape (damage halved/none on success; condition on fail), observationally identical to the creature being untouched by the spell. So a sculpted target is fully excluded rather than emitting a fabricated auto-success `SaveRolled` (the event schema requires a real d20, which would either misreport the roll or burn RNG). This keeps the per-target loop honest and the emitted log clean.

### Validation (only when `sculptedTargetIds` is non-empty)

- caster must bear `GrantSculptSpells` (else `cannot sculpt spells`),
- spell school must be `evocation` (else `applies only to Evocation spells`),
- count ≤ `1 + slot level` (else `can exclude at most N creature(s)`),
- each chosen id must be among `targetIds` (else `not among the spell's targets`).

"The spell's level" is read as the **slot level** used (handles upcasting and cantrips uniformly).

## Files

- [src/schemas/effects.ts](../../src/schemas/effects.ts): `GrantSculptSpells` (TS union + zod + `EFFECT_KINDS`).
- [src/effects/builder.ts](../../src/effects/builder.ts): `markSculptSpells()` / `hasSculptSpells()` + the apply case.
- [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts): `sculptedTargetIds` on `CastSpellIntent`; sculpt validation + per-target skip in `planSaveMechanic`.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): `sculpt-spells` → `GrantSculptSpells`.
- [tests/unit/engine/slice-732-sculpt-spells.test.ts](../../tests/unit/engine/slice-732-sculpt-spells.test.ts) (new): excludes a chosen target (0 damage, no save, no push) while the other takes full damage; control without sculpting; count-cap throw; non-Evocation throw; target-membership throw; L5 Evoker cannot sculpt.
- [README.md](../../README.md), [docs/concepts.md](../concepts.md), [docs/authoring-content-packs.md](../authoring-content-packs.md), [docs/status.md](../status.md): EFFECT_KINDS counts 65→66 (primitives 64→65), CI-guarded by doc-counts.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. doc-counts updated for the new effect kind; features coverage snapshot adds `evoker L6 sculpt-spells`.

## Audit (Uncle Bob)

- **Reuse**: the flag effect mirrors `GrantPotentCantrip` (marker + accessor); the exclusion rides the existing per-target loop's early-continue (alongside the slice-500 type-gated skip).
- **SRD-faithful**: up to 1 + slot level excluded; auto-succeed + no damage modeled as full exclusion; Evocation-only; caster-gated.
- **Effect-driven**: no hardcoded subclass check in cast-spell — the feature carries the marker, and sculpting is an opt-in consumer intent (`sculptedTargetIds`), so unsculpted casts are byte-identical.
