# Slice 623 — close the three RAW bugs the slice-622 fuzz review surfaced (Vex autoExpiry, Innate Sorcery advantage, Monk Dexterous Attacks)

**Type:** Engine + tests.

The slice-622 pool-based fuzz immediately paid back: a 10-seed review caught three real RAW deviations that the prior narrow-loadout fuzz couldn't see because it never rolled the right class+weapon+condition combinations. Each fix targets a different subsystem.

## Bug 1: Vex weapon mastery expired on the wrong turn (fuzz seed 7000)

RAW 2024 Vex: "you have Advantage on your next attack roll against that creature before the end of *your* next turn." [../../src/engine/plan/encounter.ts:85](../../src/engine/plan/encounter.ts#L85) `planAutoExpireConditionsAtTurnEnd` keyed the sweep off `applied.sourceCharacterId` — Vex's `vexing-active` condition sets source = vexed target (so `consumeOnAttack` at [../../src/engine/plan/attack.ts:535](../../src/engine/plan/attack.ts#L535) can scope to attacks against that target). Result: Vex expired at the *vexed target's* turn-end, before the vexer got their next turn.

Two usages of `sourceCharacterId` on the same condition were in conflict: consume needs target-as-source; expiry RAW says bearer-as-source.

**Fix**: new `expirySourceFromBearer?: boolean` flag on the [AutoExpirySchema](../../src/schemas/content/condition.ts) decouples them. When true, the encounter sweeps use `character.id` (the BEARER who carries the condition) instead of `applied.sourceCharacterId`. `vexing-active` gets the flag; the consumeOnAttack scoping stays unchanged. Both sweeps (`planAutoExpireConditionsAtTurnStart` + `planAutoExpireConditionsAtTurnEnd`) now thread `content` so they can read the flag.

## Bug 2: Innate Sorcery advantage on sorcerer spell attacks never fired (fuzz seed 7006)

RAW 2024 Sorcerer L1 Innate Sorcery: 1-minute BA buff that gives "+1 spell save DC AND Advantage on the attack rolls of Sorcerer spells you cast." The `innate-sorcery-active` condition only carried the +1 DC arm; the advantage arm was deferred per [../../src/engine/plan/innate-sorcery.ts:45-50](../../src/engine/plan/innate-sorcery.ts#L45-L50). Independently, the spell-attack path in [../../src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) never queried `casterEffects.advantageFor('attack', ...)` — weapon attacks did the equivalent at [../../src/engine/plan/attack.ts:867](../../src/engine/plan/attack.ts#L867) but spell attacks dropped the attacker-side advantage entirely.

**Fix**: (a) add `SetAdvantage on:'attack' mode:'advantage'` to `innate-sorcery-active`; (b) compute `casterSelfAdvantage = casterEffects.advantageFor('attack', casterAttackFacts)` in cast-spell.ts and fold it into the same grants/imposes resolution the weapon path uses. Documented RAW deviation: the engine grants advantage on ALL spell attacks while Innate Sorcery is active, not strictly Sorcerer-cast spells. At L1 this is the same set; multiclass sorcerers casting non-sorcerer-list spells over-benefit. Tracked as a follow-up needing a `bearer.castingClassId` fact on the spell-attack predicate matcher.

## Bug 3: Monk Martial Arts "Dexterous Attacks" never swapped STR→DEX on monk weapons (fuzz seed 7007)

RAW 2024 Monk L1 Martial Arts: while unarmed or wielding only monk weapons and not wearing armor or wielding a shield, monks use DEX instead of STR for attack + damage rolls on monk-eligible weapons (Simple Melee + Martial Melee with the Light property). [../../src/engine/plan/attack.ts:371-395](../../src/engine/plan/attack.ts#L371-L395) implemented only the Martial Arts *die scaling*, and only for `unarmed-strike`. The STR→DEX swap on monk-eligible weapons (javelin, shortsword, scimitar, etc.) was missing — a fuzz monk attacking with a javelin used STR (+1) when RAW says DEX (+2).

**Fix**: new exported `martialArtsApplies(character, weapon)` helper in [../../src/derive/attack.ts](../../src/derive/attack.ts) checks (a) monk level ≥ 1, (b) no armor + no shield (RAW gate on the whole feature), (c) the weapon is unarmed strike OR a simple melee OR a martial melee with light + not two-handed. Called from both `chooseAttackAbility` (derive) and `chooseDamageAbility` (planner). The signature widened from `{ abilityScores }` to a full `Character` so the helper has access to `classes` and `equipped`. The slice-622 monk fuzz transcript at seed 7007 now correctly attacks at +4 (DEX +2 + PB +2) instead of +3 (STR +1 + PB +2); the L6 monk golden at [../../tests/golden/transcripts/s207-empowered-strikes.transcript.md](../../tests/golden/transcripts/s207-empowered-strikes.transcript.md) regenerated (Kai's unarmed strike now uses DEX +4 vs STR +2 — RAW-correct, expected change).

## Tests

[../../tests/unit/engine/slice-623-fuzz-review-bugs.test.ts](../../tests/unit/engine/slice-623-fuzz-review-bugs.test.ts), 5 cases — one per bug + an "armored monk loses Martial Arts" negative test + a "no Innate Sorcery means single d20" negative test. The Vex test steps through round-1 + round-2 turn-ends and asserts the removal happens at the *bearer's* turn-end, not the source's; pre-fix this test would have caught Vex disappearing at the wrong moment.

**Real bug avoided**: when wiring `chooseDamageAbility` for the monk fix, the narrow signature (`{ abilityScores }`) wouldn't have given access to `classes`/`equipped`. The build failed loudly until widened to `Character` — better than silently using the narrow type and missing the new path.

## Verification

`npx tsc --noEmit` clean. Full suite green. 10-seed `--vs pc` re-sweep at seeds 7000-7009 confirms: seed 7000 now shows `Aria attacks Bran [advantage]: d20(16/19)` (Vex advantage consumed by Aria's next-turn attack — pre-fix the `[advantage]` marker was missing because Vex had already expired); seed 7006 shows `Aria attacks Bran [advantage]: d20(1/19)` for Chromatic Orb (Innate Sorcery advantage now applied); seed 7007 shows Bran's monk javelin at `+4` (was `+3`) and damage `+2` (was `+1`).

## RNG impact

Every spell-attack now consumes a query against `casterEffects.advantageFor('attack', ...)`. No additional `rollDie` consumption unless `casterSelfAdvantage.advantage` actually flips the d20 from 1 to 2 rolls — i.e., only when a sorcerer with Innate Sorcery is casting. Vex's autoExpiry flag is data-only and doesn't shift RNG. Monk Dexterous Attacks shifts the attack-bonus number but doesn't change die counts. Per-seed determinism shifts on (a) sorcerer Innate Sorcery battles, (b) monk-with-monk-weapon battles, (c) Vex-mastery battles where the vexer's next-turn attack now actually rolls 2 d20s. Tracked in [../../docs/breaking-changes-queued.md](../../docs/breaking-changes-queued.md).

## Audit

- **Names**: `expirySourceFromBearer`, `martialArtsApplies`, `casterSelfAdvantage` — each names a concept the surrounding code lacked a vocabulary for. `weaponOf`/`masteryOf` would have shadowed slice 622 unfortunately; chose `martialArtsApplies` to mirror `canUseWeaponMastery` from slice 502.
- **DRY**: the existing `bonusDiceFor` / `critThreshold` / `advantageFor` call shape for weapon attacks is reused verbatim for spell attacks — only the missing line was added.
- **SRP**: each fix is one-concept, one-site. The autoExpire decoupling lives at the SCHEMA layer (one flag) + the SWEEP layer (one ternary); content opts in via the flag. Martial Arts lives in the derive layer; cast-spell.ts owns spell-attack-side advantage.
- **Magic numbers**: none added.
- **at-threading**: no new clock reads — the planners use their existing `at` values.
- **Mechanical outcomes asserted**: (a) Vex removal happens at the BEARER's turn-end; (b) Innate Sorcery active = 2d20 spell attack; (c) Monk with simple-melee weapon = DEX bonus; (d) armored monk loses Martial Arts.
- **Pattern-check**: Power Word Speed Zero (`power-word-speed-zero-active`) was flagged by the inventory pass as having the same source-vs-bearer confusion. Left for a separate slice because its RAW reading is ambiguous ("until the start of the caster's next turn") and the fix needs a separate RAW review of whether `expirySourceFromBearer` is the right fix or the trigger should change to `turnStart`. Not in scope for the fuzz-review closure.
- **Tests**: each bug's test pins the canonical RAW outcome the fuzz transcript surfaced. The negative test for armored monk catches a likely regression class (someone removing the no-armor gate would have a passing positive test but a failing negative).

## Open follow-ups (tracked for separate slices)

- **`power-word-speed-zero-active`** autoExpiry semantics: needs its own RAW pass on whether `expirySourceFromBearer` or trigger change is correct.
- **Innate Sorcery class gate**: currently advantage fires on ALL spell attacks while active; should gate on "spell is a Sorcerer-list spell" via a new `bearer.castingClassId` predicate fact. ~~**Closed by slice 627.**~~
