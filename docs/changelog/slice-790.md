# Slice 790 — CR 0-1 multiattackers: Violet Fungus + Sahuagin Warrior

**Type:** Content (2 new natural-weapon defs + 2 statblock `actions`/`multiattack`), SRD-verified. Continues the [L7 audit](../l7-completion-audit.md) `multiattack-unpopulated` sweep — closes the CR 0-1 band's remaining real multiattackers (the third, Goblin Boss, shipped in slice 789).

## What this is

The two CR ≤ 1 RAW multiattackers whose attack needed a brand-new weapon definition (slice 789 deferred these — it shipped only multiattackers reusing existing defs). Both verified directly against the SRD markdown clone (`monsters-A-Z.md`), not just the workflow output:

- **Violet Fungus** (CR 1/4) — *"Multiattack. The fungus makes two Rotting Touch attacks. Rotting Touch. Melee Attack Roll: +2, reach 10 ft. Hit: 4 (1d8) Necrotic damage."* New `violet-fungus-rotting-touch` (1d8 necrotic, `["reach"]` for the 10 ft, **`noAbilityModifierDamage: true`** — RAW shows a flat `1d8` with no `+mod`, mirroring `sprite-enchanting-bow`) + `multiattack` ×2.
- **Sahuagin Warrior** (CR 1/2) — *"Multiattack. The sahuagin makes two Claw attacks. Claw. Melee Attack Roll: +3, reach 5 ft. Hit: 4 (1d6 + 1) Slashing damage."* New `sahuagin-warrior-claw` (1d6 slashing, no rider; the `+1` is the wielder's STR mod, added by the engine) + `multiattack` ×2.

Both are riderless, so no deferred onHit arms. They consume the existing slice-464 `multiattack` bridge — no engine change.

## Note on the authoring standard (for the rest of the sweep)

This slice establishes the rider-aware authoring pattern the higher bands follow: each new natural weapon is verified against the SRD `Hit:` line, `damageDice` carries the dice **without** the ability modifier (the engine adds STR/DEX + PB), `noAbilityModifierDamage` is set when RAW shows a flat dice with no `+mod`, reach > 5 ft uses the `reach` property, and onHit riders (secondary damage / conditions / saves) are authored from the SRD text — with the truly weapon-inexpressible riders (max-HP / ability-score drain, on-kill spawn) left to their existing tracked audit rows (e.g. `drain-undead-arms`).

## Tests

- The slice-788 pack-integrity guard validates the two new `multiattack` weaponIds resolve to the new weapon defs — green.
- `docs/getting-started.md` + `docs/starter-pack-gaps.md` weapon count bumped 80 → 82 (and the items total 548 → 550), per the `doc-counts` audit.
- No new test file: content reusing the `multiattack` primitive (covered by slices 464/472); neither monster is a combat-fuzz statblock, so no transcript drift.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (575 files, 4462 passed). JSON validates; both new weapons resolve.
