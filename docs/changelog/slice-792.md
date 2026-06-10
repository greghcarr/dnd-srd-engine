# Slice 792 — CR 6-11 multiattack sweep: closes `multiattack-unpopulated`

**Type:** Content (statblock `actions` + `multiattack` + 67 new natural-weapon defs), SRD-verified via workflow + apply-script. The final band of the [L7 audit](../l7-completion-audit.md) `multiattack-unpopulated` sweep — **the blocker is now closed.**

## What this is

The 46 RAW multiattackers among the 47 CR 6-11 statblocks (Remorhaz is correctly single-attack): the eight young chromatic/metallic dragons, the four giants (Stone/Frost/Fire/Cloud), the golems (Stone/Clay/Shield Guardian), the demon lords (Vrock/Hezrou/Glabrezu), the devils (Chain/Bone/Horned), Hydra, Behir, Treant, Aboleth, Deva, the nagas, and the genies.

**Pipeline** (same as 791): a workflow read the SRD markdown per monster, authored attacks + multiattack, and adversarially re-verified. This band's run hit the API monthly spend limit mid-flight; **`resumeFromRunId` re-ran only the failed author batch + the verifiers** (the 7 successful author batches returned from cache), so the applied result is **fully verified**. The verifiers caught the same buffed-weapon class as CR 2-5 — the Assassin's poison Shortsword/Light Crossbow (5d6/6d6 poison), the Pirate Captain's 2d8 Rapier + 2d10 Pistol, the Mage's Arcane Burst as a ranged Force attack (not a thrown melee) — and corrected them.

**Spot-checked against canon:** Frost Giant (Frost Axe 2d12 + 2d8 cold ×2), Young Black Dragon (Rend 2d4 + 1d6 acid ×3), **Hydra (Bite ×5 — its five heads)**, Tyrannosaurus Rex (Bite + Tail), Vrock (Shred 2d6 + 3d6 poison ×2) — all match the SRD.

## Sweep complete

| Band | Multiattackers | Slice |
|---|---|---|
| CR 0-1 | 3 (band is multiattack-poor) | 789-790 |
| CR 2-5 | 64 | 791 |
| CR 6-11 | 46 | 792 |

**113 multiattackers** authored across the sweep (the pack went from 11 → 122 wired multiattackers); **157 new natural-weapon defs** (weapon count 80 → 237).

## Deferred (tracked) — the on-hit-rider follow-up pass

Across all three bands, ~24 **gated** condition/save riders are intentionally not applied: size/charge-gated grapples and prone (Aboleth, Chuul, Roper, Griffon, the giants' boulders, Chimera/Djinni storm bolts…), and riders that also need new condition defs (Bearded Devil `infernal-wound`, Werebear lycanthropy, Cloud Giant's Thundercloud `incapacitated`, Oni's `frightened`). The flat sweep schema can't express the gate predicate, and an unconditional apply would be wrong. They join the existing `dragon-rend-no-elemental-rider` row (the young dragons' Rend reuses the pre-existing incomplete `*-dragon-rend` defs) as a focused rider pass. The base + secondary damage + multiattack — the bulk of each monster's RAW output, and the named blocker — ship now.

## Tests

- pack-integrity (slice 788) validates all weaponIds resolve; `srd-weapon-conformance` confirms no canonical-equipment name collision; `phantom-fields` confirms no class/spell id-collision. No duplicate weapon ids or names.
- Weapon count 170 → 237 (items total 638 → 705) per `doc-counts`.
- None of these are combat-fuzz statblocks → no transcript drift.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (575 files, 4462 passed). JSON validates.
