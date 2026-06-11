# Slice 826 — monster on-hit rider pass (batch 4: more grapple / prone)

**Type:** Content (6 natural-weapon `onHit` riders + their descriptions). No engine change. Advances the [L7 audit](../l7-completion-audit.md) `monster-onhit-rider-pass` quirk.

## What shipped

Batch 1 (slice 822) wired 8 of the size-gated grapple/prone weapon riders; this finishes the in-scope set that fits the existing machinery (`applyConditionId` + the slice-446 `target.creatureSize` / slice-491 charge facts, the `boar-gore`/`wolf-bite` shape):

| Weapon (monster, CR) | Rider | Gate |
|---|---|---|
| Glabrezu Pincer (CR 9) | Grappled | ≤ Medium |
| Roc Talons (CR 11) | Grappled + Restrained | ≤ Huge |
| Grick Tentacles (CR 2) | Grappled | ≤ Medium |
| Barbed Devil Claws (CR 5) | Grappled | ≤ Large |
| Chimera Ram (CR 6) | Prone | ≤ Medium |
| Mammoth Gore (CR 6) | Prone | ≤ Huge **and** charged |

Each SRD-verified against `monsters-A-Z.md` / `animals.md`. The grapple riders rely on the attack planner stamping the condition's `sourceCharacterId = attacker` (so the Grappled-vs-non-grappler arm resolves); escape DCs stay consumer-managed (flat `grappled`), as in batch 1. Player-facing descriptions updated to the now-accurate effect.

Spot-checks that didn't yield a rider (correctly left unwired): Treant Slam (plain), Hydra Bite (plain) — verified, not assumed.

## Still open (tracked)

Only the genuinely-different **save-action** shape remains: the **Constrict** actions (Behir / Couatl / Marilith / Giant Constrictor — `StrengthSavingThrow: DC, one creature within reach. Failure: damage + Grappled`, no attack roll) and the Djinni-whirlwind-style save-or-grapple actions. These need a new monster **save-action** mechanism (auto-hit save-or-effect), not the weapon on-hit rider machinery — a separate engine slice.

## Tests

`tests/unit/engine/slice-826-monster-onhit-riders-batch4.test.ts` (6): the 6 weapons carry the expected on-hit conditions; Grick grapples a Medium target (recording the grick) but not a Large one; Roc applies both Grappled + Restrained to a Huge target; Glabrezu/Barbed Devil grapple at their size gates; Chimera Ram knocks a Medium target Prone; Mammoth Gore's Prone fires only on a charge.

## Verification

`npx tsc --noEmit` clean; the player-facing-descriptions lint + pack-integrity + coverage snapshots green; `npm run test:fast` green.
