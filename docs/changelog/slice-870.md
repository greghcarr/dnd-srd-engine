# Slice 870 — Compulsion: multi-target WIS save → Charmed (Concentration)

**Type:** Content-only (no engine change). Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-compulsion` ("WIS save → forced move each turn; nothing emitted").

## The gap

RAW (SRD 5.2.1 Compulsion, Bard): "Each creature of your choice that you can see within range must succeed on a Wisdom saving throw or have the Charmed condition until the spell ends. For the duration, you can take a Bonus Action to designate a direction ... Each Charmed target must use as much of its movement as possible to move in that direction on its next turn ... After moving in this way, a target repeats the save, ending the spell on itself on a success." (Concentration, up to 1 minute.) The spell shipped `mechanicalEffects: []` — a cast did nothing.

## The fix

Content-only, the Dominate/Banishment pattern — reuse the **shared `charmed`** condition, no new wiring:

```json
{ "kind": "save", "ability": "WIS", "conditionOnFail": "charmed" }
```

- **Multi-target** ("each creature of your choice"): `planSaveMechanic` already loops over `intent.targetIds`, rolling a WIS save per chosen target and applying `charmed` on each failure.
- **Shared `charmed`**: the charmed targets can't attack the caster and the caster gets social-check Advantage (the slice-807 arms, keyed on `conditionId === 'charmed'`) — all for free.
- **Concentration-bound**: `planSaveMechanic` stamps `sourceEffectInstanceId`, so the charm lifts when the caster's Concentration drops (RAW "until the spell ends").

### Deferred (one positional/consumer arm)

The Bonus-Action **forced-movement direction** ("designate a direction ... must use as much of its movement as possible to move that way, taking the safest route") and its coupled **"after moving in this way, a target repeats the save"** are deferred together: the engine doesn't model the directed forced move (positions/movement are consumer-owned), and the re-save is *triggered by* that move, so the two are one arm — the same shape as Dominate Beast's deferred telepathic-control link.

## What shipped

- Content: `compulsion` wired (`{ save WIS, conditionOnFail: 'charmed' }`).
- New 3-test `tests/unit/engine/slice-870-compulsion.test.ts`: the mechanic shape; a save per chosen target (DC 15) with exactly the failed targets Charmed — each sourced to the Bard and concentration-bound; a successful saver is not Charmed.
- `spell-coverage` flips `compulsion` from `skip` → `save` (no type gate, so the generic Humanoid-target harness exercises it directly).
- Spell-wired counts bumped: `gaps-spells.md` L4 `21 → 22 wired` / `7 → 6 deferred`; cross-doc total `212 → 213 wired` / `59 → 58 schema-only` (README / status ×3 / getting-started / starter-pack-gaps).
- CHANGELOG size discipline: evicted slices 831-836 to [archive-slices-831-836.md](archive-slices-831-836.md) (the live file was approaching the 60 KB ceiling).

## Verification

`npx tsc --noEmit` clean; new 3-test slice-870 green; spell-coverage green. `npm run test:fast` (647 files, 4854 passed — +1 file / +4 tests over slice 869: the 3 new tests + compulsion now exercised in coverage). doc-counts + doc-size + doc-links + `release:doc-review` ("wired count 213 MATCHES") green. No engine / schema / condition / snapshot change.
