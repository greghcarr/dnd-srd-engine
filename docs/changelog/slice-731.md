# Slice 731 — engine: Cleric Blessed Healer (Life Domain L6)

**Type:** Engine feature (new effect kind + cast-spell hook). Additive. Wires the slice-54 Life Domain L6 stub. L6 SRD-complete cycle.

SRD 5.2.1 Life Domain L6 Blessed Healer: "Immediately after you cast a spell with a spell slot that restores Hit Points to one or more creatures other than yourself, you regain Hit Points equal to 2 plus the spell slot's level."

## What changed

- New flag effect **`GrantBlessedHealer`** (the `GrantMaxHealingDice` pattern): a marker on the feature, surfaced as `effectStack.hasBlessedHealer()`.
- The cast-spell heal handler, after applying a slot heal, now self-heals the caster `2 + slotLevel` once when `hasBlessedHealer()` AND `slotLevel >= 1` AND not a free cast AND at least one heal target is a creature other than the caster. Respects the caster's own healing-blocked state.
- Pack: the `blessed-healer` Life Domain L6 feature gains `{ kind: 'GrantBlessedHealer' }`.

The self-heal is emitted as a `Healed` with `source: 'blessed-healer'`, once per cast (not per target). Cantrips (slotLevel 0) and free casts (no slot spent) don't trigger it, per RAW ("with a spell slot").

## Files

- [src/schemas/effects.ts](../../src/schemas/effects.ts): `GrantBlessedHealer` (TS union + zod + `EFFECT_KINDS`).
- [src/effects/builder.ts](../../src/effects/builder.ts): `markBlessedHealer()` / `hasBlessedHealer()` + the apply case.
- [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts): the Blessed Healer self-heal in the heal handler.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): `blessed-healer` → `GrantBlessedHealer`.
- [tests/unit/engine/slice-731-blessed-healer.test.ts](../../tests/unit/engine/slice-731-blessed-healer.test.ts) (new): heals the cleric 2 + slot level when healing another; scales with slot; doesn't trigger on self-only heals; absent before L6.
- [docs/concepts.md](../../docs/concepts.md), [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md), [docs/status.md](../../docs/status.md), [README.md](../../README.md): EFFECT_KINDS counts 64→65 (primitives 63→64), CI-guarded by doc-counts.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. doc-counts updated for the new effect kind; features coverage snapshot adds `life-domain L6 blessed-healer`.

## Audit (Uncle Bob)

- **Reuse**: the flag effect mirrors `GrantMaxHealingDice` (marker + accessor); the self-heal rides the existing heal-handler + `isHealingBlocked` gate.
- **SRD-faithful**: 2 + slot level, once per cast, only when healing another creature with a slot (cantrips/free casts excluded).
- **Effect-driven**: no hardcoded subclass check in cast-spell — the feature carries the marker (the Disciple-of-Life convention).
