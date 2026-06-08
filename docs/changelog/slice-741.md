# Slice 741 — content: Barbarian Instinctive Pounce (L7)

**Type:** Content (capability marker). Additive, byte-identical. Wires the Barbarian L7 stub. L7 SRD-complete cycle.

SRD 5.2.1 Barbarian L7 Instinctive Pounce: "As part of the Bonus Action you take to enter your Rage, you can move up to half your Speed."

## What changed

- Pack: the Barbarian L7 `instinctive-pounce` feature gains `Custom { handlerId: 'instinctive-pounce' }` — a capability marker (no longer an `effects: []` stub).

## Why a marker (not an event)

Instinctive Pounce is **positional movement**, and the engine deliberately doesn't model positions or movement budgets ([docs/engine-scope.md](../engine-scope.md): movement/positions are consumer intent). A position-aware consumer (e.g. dnd-web's tactical mode) reads the capability and grants the half-Speed move when the barbarian rages; for a consumer, "has Instinctive Pounce" is simply "barbarian level ≥ 7."

Notably this does **not** reuse the `Disengaged { limitedToFeet }` event (the Tactical Shift / Rogue Withdraw primitive): that event carries **no-provoke** semantics, but RAW Instinctive Pounce movement *can* provoke Opportunity Attacks. Fabricating a Disengaged on Rage would introduce a rules drift (the same class of edition/semantics drift fixed in slice 735), so `planRage` is left untouched and stays byte-identical — the half-Speed move is consumer-applied.

## Files

- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Barbarian L7 `instinctive-pounce` → `Custom { handlerId: 'instinctive-pounce' }`.
- [tests/unit/engine/slice-741-instinctive-pounce.test.ts](../../tests/unit/engine/slice-741-instinctive-pounce.test.ts) (new): the L7 row carries the marker; a L6 barbarian doesn't have it; entering Rage at L7 emits the standard Rage events and NO movement event (the half-Speed move is consumer-applied).
- [tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts): `instinctive-pounce` added to `BACKED_INDIRECTLY` (the consumer-managed/positional-marker allowlist, alongside halfling-nimbleness / elf-trance).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No new effect kind (no doc-counts change); features coverage snapshot adds `barbarian L7 instinctive-pounce`. `planRage` byte-identical.

## Audit (Uncle Bob)

- **Honest scope**: models the capability, not a fabricated movement event; respects the engine's no-positions boundary.
- **No drift**: avoids the no-provoke over-grant that reusing `Disengaged` would introduce.
- **Reuse**: the `Custom { handlerId }` capability-marker convention (cutting-words / peerless-skill / heightened-focus).
