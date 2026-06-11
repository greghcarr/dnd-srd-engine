# Slice 822 — monster on-hit rider pass (batch 1: size-gated grapple / prone)

**Type:** Content (10 natural-weapon `onHit` riders + their descriptions). No engine change. Advances the [L7 audit](../l7-completion-audit.md) `monster-onhit-rider-pass` quirk.

## The gap

The multiattack sweep (789-792) shipped each monster's base + secondary damage + multiattack, but deferred the **gated on-hit riders** the flat extraction couldn't express — the natural weapons' descriptions literally said *"Deferred (rider pass): the on-hit condition/save."* This batch wires the ones using **existing conditions** + the proven gate pattern.

## The pattern (boar-gore / wolf-bite)

Each rider is an `onHit` entry: `applyConditionId` gated on a `condition` predicate over `target.creatureSize` (the slice-446 fact) — the same shape wolf-bite (Prone, Medium-or-smaller) and boar-gore (charge-gated) already use. The grapple riders rely on the attack planner stamping the condition's `sourceCharacterId = attacker`, so the `grappled` condition's "Disadvantage vs anyone other than the grappler" arm resolves correctly.

## What shipped (10 weapons, 8 monsters)

| Weapon (monster) | Rider | Gate |
|---|---|---|
| Aboleth Tentacle | Grappled | ≤ Large |
| Chuul Pincer | Grappled | ≤ Large |
| Chain Devil Chain | Grappled + Restrained | ≤ Large |
| Griffon Rend | Grappled | ≤ Medium |
| Otyugh Tentacle | Grappled | ≤ Medium |
| Roper Tentacle | Grappled + Poisoned | none |
| Tyrannosaurus Bite | Grappled + Restrained | ≤ Large |
| Tyrannosaurus Tail | Prone | ≤ Huge |
| Stone Giant Boulder | Prone | ≤ Large |
| Triceratops Gore | extra 2d8 piercing + Prone | ≤ Huge **and** charged |

Each was SRD-verified against `references/srd-markdown/monsters-A-Z.md` / `animals.md` (the dinosaurs live in `animals.md`). Verifying every line caught that a `+14 … Grappled DC 19` line near the T-Rex was actually the **Purple Worm** (CR 15, out of scope) — the rider details came from the correct headings, not the line proximity. The now-accurate effect is reflected in each weapon's player-facing `description` (replacing the stale "Deferred" note).

The escape DCs (RAW "escape DC N") are consumer-managed — the engine models `grappled` as a flat condition (Speed 0 + the grappler-disadvantage arm), mirroring the consumer-managed Prone duration on wolf-bite.

## Still open (tracked)

(a) The save-based **Constrict** actions (Behir / Couatl / Marilith / Giant Constrictor) — a `StrengthSavingThrow` *action* shape, not a weapon on-hit rider. (b) Riders needing **new condition defs** — Bearded Devil `infernal-wound`, Werebear lycanthropy `cursed`, Oni `frightened`-on-save. (c) The Cloud Giant Thundercloud / Chimera / Djinni save-or-condition actions.

## Tests

`tests/unit/engine/slice-822-monster-onhit-riders.test.ts` (8): the 10 weapons carry the expected on-hit conditions; the target-size fixtures are Medium/Large/Huge; Griffon grapples a Medium target (recording the griffon as grappler) but not a Large one; Aboleth grapples a Large but not a Huge; Chain Devil applies both Grappled + Restrained; Roper grapples + poisons any size; the T-Rex Tail knocks a Huge target Prone; and the Triceratops Gore's extra 2d8 + Prone fire only on a charge.

## Verification

`npx tsc --noEmit` clean; the player-facing-descriptions lint + pack-integrity + coverage snapshots green; `npm run test:fast` green (604 files, 4615 passed).
