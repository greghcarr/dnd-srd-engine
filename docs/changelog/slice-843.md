# Slice 843 — breath-weapon canon sweep (9 stale 2014 statblocks fixed)

**Type:** Content drift fix + a durable full-coverage guard test. No engine, schema, or event change.

## The finding

While canon-checking the Ankheg's statblock for slice 842 (`variable-ac-by-posture`), its **Acid Spray** breath weapon was found drifted: the pack carried `saveDC: 13, damageDice: "3d6"`, but SRD 5.2.1 (`monsters-A-Z.md`) reads **DC 12, 14 (4d6)**. Per the pattern-check discipline, that one find triggered a sweep of **every** `breathWeapon` in the pack against the SRD.

The sweep cross-referenced all **44** breath weapons against `references/srd-markdown/monsters-A-Z.md` (the only valid source). **9 carried stale 2014-MM stats; the other 35 were already 2024-correct** (every metallic dragon, every wyrmling, every ancient, young green/blue/red, the Dragon Turtle, and the Winter Wolf).

| Monster | Field(s) | 2014 (pack) → 2024 (SRD) |
|---|---|---|
| Ankheg | DC + dice | DC 13→**12**, 3d6→**4d6** |
| Iron Golem | DC + area + dice | DC 19→**18**, 15-ft→**60-ft** Cone, 10d8→**10d10** |
| Young White Dragon | dice | 10d8→**9d8** |
| Young Black Dragon | dice | 11d8→**14d6** |
| Adult White Dragon | dice | 16d8→**12d8** |
| Adult Black Dragon | dice | 14d8→**12d8** |
| Adult Green Dragon | dice | 22d6→**16d6** |
| Adult Blue Dragon | dice | 16d10→**11d10** |
| Adult Red Dragon | dice | 18d6→**17d6** |

The pattern is clean: every drifted entry matches its **2014 Monster Manual** breath line (the 2014 adult chromatic dragons had inflated breath dice; the Iron Golem's 2014 Poison Breath was a 15-ft cone, 10d8, DC 19; the 2014 Ankheg Acid Spray was DC 13, 3d6). These specific statblocks were authored from 2014 values and never updated; everything else was authored from 2024. Aligning all nine to the 2024 SRD canon.

## What changed

Nine `breathWeapon` specs in `src/content/packs/starter-pack.json` — only `saveDC`, `area.sizeFeet`, and `damageDice` (the schema has no cached average; nothing else to touch). No engine/schema/event change.

## The guard

`tests/audit/slice-843-breath-weapon-canon.test.ts` (45) pins **every** breath weapon to its exact SRD 5.2.1 signature (recharge, save ability, DC, area shape + size, damage dice, damage type, half-on-success), catching future drift in *any* direction — including the inverse drift in the 35 that were already correct. A coverage assertion requires the canon table to cover exactly the set of pack monsters carrying a `breathWeapon`, so a newly-added breath weapon must be canon-checked here.

## Verification

`npx tsc --noEmit` clean; the new 45-test guard green; `npm run test:fast` green (623 files, 4747 passed). **No golden regeneration needed:** the combat-fuzz `MONSTER_OPTIONS` pool contains only low-CR beasts/humanoids/undead — none of the 9 changed monsters — so the fuzz-matrix goldens are unaffected; and the lone breath-weapon unit test (`plan-breath-weapon.test.ts`) builds a Young Red Dragon, which was already 2024-correct (16d6) and unchanged. Breath weapons aren't `WeaponDefinition`s → no doc-counts bump.
