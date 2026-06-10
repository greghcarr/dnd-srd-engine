# Slice 791 — CR 2-5 multiattack sweep (64 monsters, 88 natural weapons)

**Type:** Content (statblock `actions` + `multiattack` + 88 new natural-weapon defs), authored from the SRD via a verification workflow + a deterministic apply-script. The bulk of the [L7 audit](../l7-completion-audit.md) `multiattack-unpopulated` sweep — the CR 2-5 band, where multiattackers cluster.

## What this is

The 64 RAW multiattackers among the 92 CR 2-5 statblocks that lacked `multiattack`: Owlbear, Knight, Manticore, the seven dragon wyrmlings, the five lycanthropes, the four elementals, the giants (Hill Giant, Ettin, Troll), devils, hags, oozes-with-bites, and the humanoid captains/veterans/gladiators.

**Pipeline.** A 32-agent workflow read the SRD markdown clone (`monsters.md` / `monsters-A-Z.md`) per monster, authored each one's attacks + multiattack, and adversarially re-verified against the SRD — catching real issues a blind pass would have shipped: buffed monster weapons whose dice differ from the generic equipment (Ogre Javelin 2d6 not 1d6, Gladiator Spear 2d6, Veteran Heavy Crossbow 2d10), the natural-weapon `category` convention, and the `noAbilityModifierDamage` flat-dice cases. An apply-script then translated the *verified* extraction into pack edits.

**What ships per multiattacker:** a monster-prefixed natural-weapon def (name like "Owlbear Rend" so a buffed weapon never collides with canonical equipment), carrying base damage + any **unconditional secondary damage** (Knight's `+1d8 radiant`, the dragon wyrmlings' `+1dX` elemental Rend rider — the `dragon-rend-no-elemental-rider` audit shape, Salamander fire, etc.), plus `noAbilityModifierDamage` where RAW shows flat dice, plus the statblock's `actions` + `multiattack`.

**Spot-checked against canon:** Owlbear (two Rends, 2d8), Knight (Greatsword 2d6 + 1d8 radiant ×2, Heavy Crossbow 2d10 + 1d8 radiant no-mod), Red Dragon Wyrmling (Rend 1d10 + 1d6 fire), Manticore (three attacks), Werewolf (Scratch/Bite/Longbow) — all match the SRD `Hit:` lines.

## Deferred (tracked) — a follow-up on-hit-rider pass

15 **gated** condition/save riders are intentionally not applied: the size/charge-gated grapples and prone (Griffon, Otyugh, Chuul, Grick, Roper, Ettin, the elementals' Prone-on-Medium-or-smaller), and the save/condition riders that also need new condition definitions (Bearded Devil's `infernal-wound`, Werebear's lycanthropy `cursed`). The flat sweep schema can't express the gate predicate, and applying these *unconditionally* would be wrong (grappling a Gargantuan creature). They're modeled the way `boar-gore` / `wolf-bite` already gate riders — a focused manual pass. The base + secondary damage + multiattack — the bulk of each monster's RAW output — ships now.

## Apply-script correctness fixes (caught by the gate)

Two bugs the gate caught and the script now handles: (1) monster-buffed weapons were colliding with canonical equipment *names* (the `srd-weapon-conformance` audit looks weapons up by name) → every new weapon is monster-prefixed; (2) the statblock-id insertion matched the **druid class** before the druid monster → insertions are now scoped to the `monsters` array region.

## Tests

- The slice-788 pack-integrity guard validates all 88 new `actions`/`multiattack` weaponIds resolve; the `srd-weapon-conformance` audit confirms no canonical-equipment collision; `phantom-fields` confirms no stray fields.
- Weapon count bumped 82 → 170 (items total 550 → 638) per `doc-counts`.
- No new test file: content reusing the slice-464 `multiattack` primitive; none of these are combat-fuzz statblocks → no transcript drift.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (575 files, 4462 passed). JSON validates; no duplicate weapon ids/names; all weaponIds resolve.
