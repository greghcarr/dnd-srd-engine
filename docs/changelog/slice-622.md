# Slice 622 — pool-based fuzz loadouts: every seed exercises a different swath of L1 SRD

**Type:** Tooling + tests.

The combat-fuzz tool ([../../scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts)) is the engine's bug-spotter: human DnD experts skim random transcripts and catch RAW correctness errors (slices 601-621 surfaced ~12 real bugs this way). Coverage per seed determines bugs per review. Pre-slice the tool had fixed per-class loadouts (one weapon, one armor, one fixed cantrip+spell list per class) and 10 monsters — so 50 seeds produced only 12 distinct spells cast, 3 of 8 weapon masteries, 15 distinct equipment items, and 10 monster types ever seen.

## Changes ([../../scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts))

- **`CLASS_BUILDS` → `CLASS_POOLS`**: each class now has a `weaponPool`, `armorPool`, optional `cantripPool` + `numCantrips`, optional `l1SpellPool` + `numL1Spells`. New `pickN` helper does without-replacement draws via the existing `rngFloat` cursor. Build phase draws everything at character creation; `pickIntent` stays RNG-free.
- **Two-handed + shield resolution**: build phase rolls `useShieldChance` (gated on class shield proficiency) BEFORE the weapon draw; if shield wins, the weapon pool is filtered to non-two-handed options. Mutually-exclusive equipment guaranteed by construction.
- **Local `WEAPON_MASTERY` table deleted**: replaced with one-line pack lookup `pack.items.find(...).mastery`. Single source of truth — every RAW mastery (Sap, Vex, Slow, Cleave, Graze, Push, Topple, Nick) surfaces automatically the moment its weapon rolls.
- **`MONSTER_OPTIONS` expanded** from 10 to 25, mixing natural-weapon beasts (stirge, black bear, sprite, giant wolf spider) and humanoid/undead with mundane weapons (goblin warrior, skeleton, zombie, bandit, cultist, guard, scout, hobgoblin warrior, gnoll warrior, kobold warrior).
- **~10 new `pickIntent` spell branches** for previously-unused L1 spells: `magic-missile` (wizard/sorcerer, before fire-bolt so it preempts), `chromatic-orb` (with `casterChoice.damageType=fire`), `burning-hands`, `ice-knife`, `thunderwave`, `guiding-bolt`, `inflict-wounds`, `command` (with `casterChoice.commandWord=flee`), `dissonant-whispers`, plus `entangle` / `heroism` / `bane` in the first-turn buff slot. Concentration spells now gate on `c.concentrationEffectId === undefined` to avoid wasting slots on a re-buff that breaks the active one.
- **Cantrip fallback reads `c.preparedSpells.includes(...)`** instead of the build-time `build.cantrips.includes(...)` — automatically activates Magic-Initiate-granted cantrips that the slice-618 cascade attaches to Sage (wizard cantrip) and Acolyte (cleric cantrip) PCs. Six new cantrips also wired (`ray-of-frost`, `shocking-grasp`, `poison-spray`, `acid-splash`, `chill-touch`, `sorcerous-burst`) so wider cantrip pools actually fire.

## Coverage gain (measured on a 100-seed `--vs pc` sweep, same baseline command before vs after)

| Metric | Before | After |
|---|---|---|
| Distinct spells cast | 12 | 25 |
| Distinct weapon masteries firing | 3 | 7+ (8 in 30-seed sample) |
| Distinct equipment items acquired | 15 | 42 |
| Monsters in pool | 10 | 25 |

## Tests

[../../tests/integration/combat-fuzz-pool-loadouts.test.ts](../../tests/integration/combat-fuzz-pool-loadouts.test.ts), 6 cases over 20 seeds: every equipped weapon / armor is a real pack id; equipped weapons respect class `weaponProficiencies` (simple / martial / martial-finesse / martial-light buckets); every prepared spell is a real pack id; two-handed weapon + shield never co-occur; equipped armor matches class `armorProficiencies`. Deliberately NOT a per-spell coverage floor — that over-pins the random surface.

**Real bug caught during test development**: the rogue pool initially included `blowgun` (martial ranged, neither finesse nor light) — rogue isn't proficient. Caught by the proficiency invariant on its first run; removed from the rogue pool with a comment.

[../../tests/integration/combat-fuzz-flags.test.ts](../../tests/integration/combat-fuzz-flags.test.ts) (slice 614, 6 cases) re-audited: all assertions check character count / names / classId / level / `LongRestStarted` presence — nothing references weapons / spells / armor / damage. Stays green across the slice as expected.

## Verification

`npx tsc --noEmit` clean; full suite green; 50-seed `--vs pc` sweep produces 21+ distinct spells cast (vs 12), 6+ distinct masteries (vs 3), 42 distinct items (vs 15). 100-seed sweep adds Dissonant Whispers + Acid Splash. Visual spot-check of 5 random transcripts: each contains at least one spell-cast event the prior fuzz never produced.

## Audit

- **Names**: `ClassPool`, `pickN`, `weaponOf`, `masteryOf`, `isTwoHandedWeapon`, `CLASS_SHIELD_PROFICIENT` — each intention-revealing. `ClassBuild` retained as the per-character snapshot (vs the per-class `ClassPool`), so the existing `BuiltCharacter.build` field and `pickIntent` reads are unchanged.
- **DRY**: one `pickN` helper covers cantrip + L1 spell draws; one `weaponOf` narrows the pack-item union; one `masteryOf` reads from it. The local `WEAPON_MASTERY` table that DUPLICATED a subset of pack data is gone.
- **SRP**: `buildL1` owns all per-character randomization (weapon, armor, shield, cantrips, spells); `pickIntent` reads `c.preparedSpells` without touching RNG (preserves the seed→battle determinism contract).
- **Magic numbers**: `STANDARD_ARRAY`, `FUZZ_MAX_LEVEL`, `useShieldChance` are all named or live on a per-pool field with documented intent.
- **Pattern-check**: swept `CLASS_BUILDS` and `WEAPON_MASTERY` references; the only consumer was within this file. No external module imported the old structures. Reviewed [../../tests/integration/combat-fuzz-flags.test.ts](../../tests/integration/combat-fuzz-flags.test.ts) for hidden assumptions about specific weapons/spells — none.
- **Tests**: pool-membership invariants catch typo / proficiency / two-handed-shield regressions (already caught one — blowgun). Coverage-floor test deliberately NOT added (over-pinning the random surface; future pool tuning would break it).

## Open follow-ups (tracked for separate slices, not in scope here)

- **Slice 623**: positional combat — spawn combatants at fixed positions and add Move intents to unlock opportunity attacks and ranged-vs-melee divergence.
- **Slice 624**: magic-item content authoring — pack has 0 common-rarity items today; ship ~10 (Eyes of Charming, Wand of Magic Missiles, +1 weapon variants, ring of protection) so fuzz can roll a random magic-item starter.
- **Slice 625**: feat-active intents — drive Magic-Initiate's `oncePerLongRest` free cast, Lucky reroll trigger, etc.
- **Slice 626**: Hellish Rebuke as a reaction (mirror the existing Shield reaction shape; not a turn-start branch).
- **Heroism / Searing Smite / Ensnaring Strike** branches added but not observed firing in the 100-seed sweep — heroism needs allies (1v1 has none), the two smites are bonus-action riders that need a different injection point than the BA-buff slot. Move to slice 626 with Hellish Rebuke.
