# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Tooling (slice 597): combat-fuzz monster variety — 10 L1-appropriate statblocks**

Slice 596 introduced `--vs monster` mode with a single Wolf as the only opposing monster, leaving the rest of the engine's L1-CR statblock surface unexercised. The pack has 14+ monsters at CR ≤ 1 with already-wired natural-weapon items; slice 597 picks 10 with diverse trait coverage and adds them to `MONSTER_OPTIONS`.

**Changes** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)): `MONSTER_OPTIONS` expanded from 1 → 10 entries:

| Monster | CR | Weapon | Key trait surfaced |
|---|---|---|---|
| Wolf | 1/4 | wolf-bite | Ally-adjacent attack advantage; onHit Prone for Medium-or-smaller |
| Venomous Snake | 1/8 | venomous-snake-bite | Poison rider + CON-save Poisoned |
| Giant Centipede | 1/4 | giant-centipede-bite | Poison damage rider + Poisoned-on-fail |
| Imp | 1 | imp-sting | Poison rider; built-in Invisibility (statblock trait) |
| Boar | 1/4 | boar-gore | Bloodied Fury rider when reduced low |
| Mastiff | 1/8 | mastiff-bite | onHit Knock Prone for Medium-or-smaller |
| Worg | 1/2 | worg-bite | Pack Tactics (ally-adjacent advantage) |
| Pseudodragon | 1/4 | pseudodragon-bite | Magic Resistance + Sting poison |
| Giant Spider | 1 | giant-spider-bite | 2d6 poison rider + Web condition |
| Cockatrice | 1/2 | cockatrice-bite | Petrified-on-fail save rider |

Each entry maps an `id → weaponId → ClassBuild` (with the natural weapon as the wielded item). The fuzz tool's `buildMonster` already mirrors the engine's [src/engine/triggers/dispatch.ts:485-546](src/engine/triggers/dispatch.ts#L485-L546) `fireSpawnCreature` path; the slice 597 work is pure data expansion.

**Verification** (15 seeds at 1v1 + 10 seeds at 2v2 vs monster):
- 5 different monster types appeared across the 15-seed 1v1 batch (worg, wolf, giant-spider, giant-centipede, boar — 3 each from the random pick).
- 2v2 vs monster mode confirmed working (10 battles complete; Pack Tactics now meaningful since Worg/Wolf opponents can have a second monster ally adjacent).
- Trait verification:
  - Giant Spider's bite emits `1d8 piercing + 2d6 poison` (seed 1101: "8 damage from Beast (2 piercing + 6 poison)" — mitigation applied) — 2-component damage chain.
  - Vex mastery fires correctly on Rogue → Worg attack (seed 1102: round 1 hit, "Mastery: Vex against Beast", round 2 attack shows `[advantage]` from vexing-active).
  - Full RAW Wolf Bite onHit Prone still verified from slice 596 (Aria is now Prone).
- Full suite green: 479 test files, 3246 passing, 173 unrelated skips.

**Audit:**
- **Names:** unchanged from slice 596 (`MONSTER_OPTIONS` shape, `buildMonster` signature, `--vs monster` flag).
- **DRY:** all 10 entries share the same `classBuild: { classId: 'companion', ... }` shape; only the per-monster primary/secondary ability + weapon id differs.
- **SRP:** tooling-data change only; no engine, content, schema, or test changes.
- **Magic numbers:** none added; HP / AC / abilities all read from each statblock.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** live fuzz verification (5 monster types appearing; trait-rich damage chains verified; 2v2 vs monster mode unblocking Pack Tactics).

**Pattern-check (filter shape: "L1-CR monsters in the pack with natural-weapon items the fuzz could spawn"):** swept the pack for monster ids where a matching `-bite` / `-sting` / `-gore` / `-claw` / `-slam` natural-weapon item exists. Found:
- Already in `MONSTER_OPTIONS`: wolf, venomous-snake, giant-centipede, imp, boar, mastiff, worg, pseudodragon, giant-spider, cockatrice ✓
- Available but deferred (CR > 1): dire-wolf, brown-bear (CR 1/2; could include), ghoul (CR 1; has paralysis save), ettercap (CR 2), couatl (CR 4), wyvern (CR 6), merrow (CR 2)
- Monsters that use STANDARD weapons (not natural): goblin (scimitar + shortbow), skeleton (shortsword + shortbow), bandit (scimitar + light-crossbow), kobold (dagger) — these need a different build path that equips a regular weapon to a monster snapshot; deferred to a follow-up if needed.

L1 SRD monster coverage went from **~7% (1 of ~15) → ~67% (10 of ~15)** in this slice.

---

**Tooling (slice 596): combat-fuzz PC vs Monster mode**

The fuzz only ever fought PC vs PC, leaving the engine's monster-statblock combat surface entirely unexercised. The ~370 SRD monster statblocks (and their traits: natural weapons with `onHit` riders, multiattack actions, breath-weapon recharge, Pack Tactics, Magic Resistance, Aura damage, Spawn Creature, etc.) live-tested only in narrow unit-test fixtures pre-slice. Slice 596 lets the fuzz spawn a low-CR monster on the opposing team.

**Changes** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)):
- New `--vs pc|monster` CLI flag (default `pc`). With `monster`, team B is built from `MONSTER_OPTIONS` (currently just the Wolf with `wolf-bite` natural weapon; structured for easy extension).
- New `buildMonster(name, pack, rngFloat)` builds a `Character` snapshot from the pack's `MonsterStatblock` schema, mirroring [src/engine/triggers/dispatch.ts:485-546](src/engine/triggers/dispatch.ts#L485-L546) `fireSpawnCreature` (the canonical engine path for instantiating a monster mid-combat). HP = `statblock.hp.average`, AC = `statblock.ac`, ability scores + speed copied; the natural weapon is created as an `ItemInstance` and equipped main-hand so the standard `engine.plan.attack` chain fires.
- `runBattle`'s teamB construction now branches on `vs`: PC mode builds `Bran[-1, -2]` via `buildL1`; monster mode builds `Beast[-1, -2]` via `buildMonster`. Symmetric with PC team size.
- Monster classes (`companion`) aren't in the level-up table, so the existing `try/catch` around `levelUpTo` skips them silently — monsters stay at their statblock baseline.

**Verification** (5 seeds at 1v1 vs wolf, seed 1000-1004):
- Seed 1000: Wolf wins initiative (d20=20+2=22 vs Aria's 16+1=17), bites Aria for 8 piercing (1d6=6+2 STR-mod), HP 8→0, **Wolf Bite's RAW onHit Prone fires** ("**Aria** is now Prone."), Aria reactively casts Shield (slice 592 post-hit dispatch — documented limitation: damage already applied).
- Seed 1004: Aria (paladin) one-shots the wolf with a longsword crit.
- 3 of 5 battles won by Aria, 2 won by Beast.
- Full suite green: 479 test files, 3246 passing, 173 unrelated skips.

**Audit:**
- **Names:** `vs: 'pc' | 'monster'` central control; `MONSTER_OPTIONS` follows `CLASS_BUILDS` shape; `buildMonster` parallels `buildL1`.
- **DRY:** `buildMonster` shares `BuiltCharacter` shape with `buildL1`, so the runBattle setup loops work uniformly.
- **SRP:** tooling only; no engine, content, schema, or test changes.
- **Magic numbers:** none added; HP / AC / abilities all read from the pack statblock.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** live fuzz verification (Wolf Bite RAW + Prone onHit + reactive Shield all fire correctly).

**Pattern-check (filter shape: "8 gaps from the user's slice 588 request — what's still untouched?"):** the 8 listed gaps are all now wired in the fuzz tool:
1. **PC vs Monster** — slice 596 (this) ✓
2. **Multi-combatant** — slice 595 (`--mode 2v2`) ✓
3. **Reactions** — slice 592 (Shield post-hit) ✓
4. **Items beyond basic 10** — slice 591 (shields + potions) ✓
5. **Weapon Mastery exercise** — slice 589 (Sap / Vex / Slow firings) ✓
6. **Levels 2-5** — slice 593 (`--level N`) ✓
7. **Buff/utility spells** — slice 590 (Bless / Mage Armor / Faerie Fire / Divine Favor) ✓
8. **Out-of-combat & time** — slice 594 (`--rest long|short`) ✓

Real engine RAW bugs found and fixed during the 8-slice cycle:
- **Slice 586**: spell-attack `AttackRolled` events didn't dispatch OnEvent triggers, silently dropping Hex / Hunter's Mark damage riders on Eldritch Blast / Fire Bolt / etc. hits.
- **Slice 589**: Rogue / Monk / Wizard weapon proficiency content deviated from SRD body prose; engine extended with `<category>-<property>` token shape; pack corrected.
- **Slice 587 + bonus**: transcript advantage display gap surfaced + a downstream RAW confirmation (Halfling + Heavy weapon → Disadvantage flowed through correctly once the display fix landed).

Remaining fuzz-tool gaps not in the original 8 (deferred): retroactive Shield (RAW conversion of hit→miss requires splitting `AttackRolled` from damage emission in the attack planner — an architectural change); AoE policy targeting (the fuzz still picks one opponent per damage cantrip even in 2v2); reaction-spell coverage beyond Shield (Hellish Rebuke, Absorb Elements, Cutting Words at L2+, Counterspell at L3+); monster variety beyond the Wolf (Goblin, Skeleton, Kobold, Imp etc. — easy to add to `MONSTER_OPTIONS`); multi-classing; subclass-feature exercise (subclasses auto-pick first option which biases the fuzz towards one path per class).

---

**Tooling (slice 595): combat-fuzz 2v2 multi-combatant mode**

The fuzz tool only ever ran 1v1 battles. Multi-combatant mechanics — initiative ordering across 4 actors, AoE save chains, Help action (2-PC adjacency), Sneak Attack adjacency, Bardic Inspiration to ally, Healing Word at range, and the simple "more bodies on the board, more emergent interactions" axis — were entirely unexercised. Slice 595 adds 2v2 support.

**Changes** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)):
- New `--mode 1v1|2v2` CLI flag (default `1v1`). `2v2` builds 2 PCs per side.
- `runBattle` now constructs `teamA: BuiltCharacter[]` and `teamB: BuiltCharacter[]` arrays (1 entry each for 1v1, 2 each for 2v2). PC names suffixed `-1` / `-2` in 2v2 mode (e.g. `Aria-1`, `Aria-2`, `Bran-1`, `Bran-2`).
- Setup events generated in a loop over all combatants (weapons + armor + shields + potions + character-created).
- `createEncounter` takes all 4 combatant ids; the engine's initiative + turn-advancing logic handles the 4-combatant rotation unchanged.
- New `chooseOpponent(activeId)` returns the first-living combatant on the opposing team (or undefined if the opposing team is wiped). Replaces the static `opponent = pcA.id === activeCb.combatantId ? pcB : pcA` lookup.
- New `teamWiped()` returns the loser team (`'A'` / `'B'`) or `null` if both teams have living members. Replaces the per-attack "is opponent dead" check in the inner loop.
- Survivor filter for slice 594's `--rest` flow now walks `[...teamA, ...teamB]`.

**Verification** (5 seeds at 1v1 default + 5 seeds at 2v2):
- 1v1 mode unchanged: 5 battles complete as before with single-character winners.
- 2v2 mode: 4-combatant initiative roll (`Aria-2 (d20=16+1=17), Aria-1 (d20=13+2=15), Bran-1 (d20=14+1=15), Bran-2 (d20=12+3=15)`), all 4 take their turns in initiative order, battle ends when one team is wiped. Seed 900 sample: Aria-1 (wizard) + Aria-2 (barbarian) defeat Bran-1 (cleric) + Bran-2 (sorcerer) in 9 rounds. Winner field reports the first character on the winning team for index display.
- Full suite green: 479 test files, 3246 passing, 173 unrelated skips.

**Audit:**
- **Names:** `teamA` / `teamB` / `teamAIds` / `teamBIds` / `teamWiped` / `chooseOpponent` follow the team-axis naming. `teamSize: 1 | 2` is the central control variable.
- **DRY:** the setup-events / character-created / level-up loops all walk `[...teamA, ...teamB]` instead of duplicating per-PC inline.
- **SRP:** tooling only; no engine, content, schema, or test changes.
- **Magic numbers:** team-size domain (1, 2) extracted as `teamSize` parameter.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** live fuzz verification (4-combatant initiative + team-wipe logic verified end-to-end).

**Pattern-check (filter shape: "1v1-only assumptions still embedded in the policy"):** swept `pickIntent` for `pcA.id` / `pcB.id` references — none remain (the helper takes `active` + `opponent` Combatants). The policy treats `opponent` as a single target per turn (it doesn't yet target multiple opponents, e.g. AoE on opposing team). AoE targeting is now meaningful in 2v2 but the policy still picks one opponent per damage cantrip. Documented as future work; the AoE planner (Sleep, Web, Burning Hands, etc.) already handles multi-target intents per its existing tests, so the gap is fuzz-side not engine-side.

---

**Tooling (slice 594): combat-fuzz out-of-combat rest cycles**

The fuzz tool ran each battle in isolation, ending after one combatant dropped. The engine's rest planners (`planLongRest` / `planShortRest`) and the post-battle `planEndEncounter` were never exercised by the fuzz, leaving resource recharge + HP regen on long rest + hit-die spending on short rest unexercised at the live-combat scale.

**Changes** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)):
- New `--rest <none|short|long>` CLI flag (default `none`). When set, after the battle ends the fuzz:
  1. Calls `engine.plan.endEncounter` with the proper outcome (`'victory'` if a winner emerged, else `'fled'`) — pre-slice the fuzz left the encounter dangling, so `endEncounter`'s `Outcome` enforcement never fired.
  2. Performs the chosen rest on the SURVIVING characters (HP > 0) — RAW dead characters can't rest.
  3. Transcripts surface the new tail events naturally: `## Encounter ends: victory.` / `## Long rest begins (Bran)` / `Long rest ends.`

**Verification** (5 seeds at level 3 with `--rest long`):
- Seed 800 + 804: Bran wins, Aria dies. Encounter ends `victory` (Bran's perspective). Bran takes a long rest (Aria skipped — dead). Long rest events emit.
- Seed 802: 20-round cap with no winner. Encounter ends `fled`. Both survive; both rest.

**Audit:**
- **Names:** `rest: 'none' | 'short' | 'long'` matches the CLI flag values; `survivors` is intent-revealing.
- **DRY:** survivor filter is one `.filter(...).map(...)` chain.
- **SRP:** tooling only; no engine, content, schema, or test changes.
- **Magic numbers:** none added.
- **at-threading:** the rest planners stamp their own `at`.
- **Mechanical outcomes asserted:** live fuzz verification (rest events surface; survivor filter works).

**Pattern-check (filter shape: "engine planners on the EXCLUDED_FROM_DISPATCH list that the fuzz could exercise"):** the rest planners are on the allowlist as "Travel / rest / resurrection / attack follow-ups" category. Now exercised by `--rest`. Remaining allowlisted planners the fuzz still doesn't exercise: `rest`, `forcedMarch`, `resurrect`, `cleave` (Cleave is mastery-class + 2nd target — needs slice 595's 2v2 to land), the various trigger-style planners (`dodge`, `sanctuaryWardSave`, `protection`, etc.) that the fuzz policy doesn't model, plus the equipment / sensor / transformation / summon planners which are out of L1-5 combat scope. Documented as future work.

---

**Tooling (slice 593): combat-fuzz levels 2-5 via engine level-up**

The fuzz tool built every character at L1, leaving the engine's per-level scaling — Extra Attack at L5, half-caster spellcasting starting at L2, full-caster slot progression L1→L5, subclass features at L3, Action Surge at L2, Channel Divinity at L2 — entirely unexercised by the bug-discovery harness. Slice 593 adds a `--level N` CLI flag (1-5) and walks both characters through `engine.plan.levelUp` from L1 to the target level after creation.

**Changes** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)):
- New `--level N` CLI flag (default 1, max `FUZZ_MAX_LEVEL` = 5).
- New `drainPendingChoices(engine, campaign, characterId)` helper auto-resolves any pending `PendingChoice` by picking the first `oneOf` option ids per choice. Covers subclass selection at L3 (auto-picks first), Wizard Scholar's two-of-six skills at L2, Druid Primal Order at L1, Cleric Divine Order at L1, Fighter Fighting Style at L1 / L2, and every other multi-pick choice. Safety-bounded to 40 iterations.
- New `levelUpTo(engine, campaign, characterId, classId, targetLevel)` calls `drainPendingChoices` first (background origin-feat choices left from CharacterCreated — e.g. Sage's Magic Initiate Wizard needs 2 cantrips picked before the L2 level-up can proceed), then walks `engine.plan.levelUp({hpStrategy: 'average'})` from L2 → targetLevel with `drainPendingChoices` after each rung.
- `runBattle` now takes a `level` arg; if `> 1`, levels both characters before the encounter starts. Both calls wrapped in try/catch so a level-up failure leaves the character at whatever level was reached rather than aborting the battle.

**Bugs surfaced and fixed during build** (all in the fuzz tool, none in the engine):
1. **Reaction-tracking field-name typo (slice 592)**. The slice 592 `tryShieldReaction` helper checked `cb.turnUsage.reactionUsed === true` — the schema field is actually `reactionUsedThisRound`. The mismatch meant Shield would always be considered "reaction available," so multiple Shield casts could fire per round, eventually hitting "reaction already used this round" errors at the engine level. Fixed in this slice.
2. **PendingChoice field-name typo**. The drain helper filtered `pendingChoices` by `p.characterId === characterId`, but the schema field is `forCharacterId`. The filter always returned undefined, so the drain loop never resolved any choice. Same shape as bug 1: my type assumption diverged from the actual schema. Fixed.
3. **PendingChoice id-vs-choiceId confusion**. `ResolveChoiceIntent` takes `choiceId: PendingChoice.id`, not `pending.choiceId`. The drain helper tried `pending.choiceId` which is undefined. Fixed.
4. **`oneOf` multi-pick choices**. The drain helper initially picked just `[pending.options[0].id]`, but choices with `oneOf: 2` (Scholar's two skills, Druid Magician's two cantrips, Wizard Sage's two cantrips, Bard's three skills, etc.) require all N selected at once. Fixed: `pending.options.slice(0, pickCount).map((o) => o.id)`.

The first two are slice 587-shape bugs (schema-field-name drift in my own helper code; pattern-check sweep across other fuzz helpers found no further matches). Bugs 3-4 are more domain-specific to the choice-resolution API.

**Verification** (15 seeds at level 5):
- Aria druid halfling reached L5 with 38 HP (10 + 4×7 average HP per level — RAW d8 = avg 5 + CON-mod 2 = 7).
- Bran wizard dwarf reached L5 with 27 HP (7 + 4×5 — d6 avg 4 + CON-mod 1 = 5).
- All 15 battles completed successfully; no engine errors.
- Battle lengths ranged 2-17 rounds (vs the 1-11 typical at L1), reflecting the higher HP totals.

**Audit:**
- **Names:** `drainPendingChoices` is verb-active and intent-revealing; `levelUpTo` mirrors `buildL1` naming.
- **DRY:** the two helpers compose cleanly (`levelUpTo` calls `drainPendingChoices` at boundaries).
- **SRP:** tooling only; no engine, content, schema, or test changes.
- **Magic numbers:** `FUZZ_MAX_LEVEL = 5` extracted; the safety-bound 40 is local + documented.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** live fuzz verification (HP scaling per class verified; full battles completed at L5).

**Pattern-check (filter shape: "my fuzz helper code that referenced an engine schema field by name"):** swept all my fuzz code that destructures or `.field` accesses engine state. The matches:
- `c.resources.find((r) => r.resourceId === ...)` ✓ matches schema (resourceId).
- `cb.turnUsage.actionUsed` ✓ matches schema.
- `cb.turnUsage.bonusActionUsed` ✓ matches schema.
- `cb.turnUsage.reactionUsedThisRound` ✓ (fixed this slice).
- `character.preparedSpells.includes(...)` ✓ matches schema.
- `character.spellSlotsUsed['1']` ✓ matches schema (string-keyed by slot level).
- `pendingChoice.forCharacterId` ✓ (fixed this slice).
- `pendingChoice.options[].id` ✓ matches schema.
- `pendingChoice.oneOf` ✓ matches schema.
No remaining shape mismatches surfaced.

---

Per-slice detail for slices 588-592 (combat-fuzz hardening: species resource grants + slot fallback; weapon mastery + RAW proficiency fixes for Rogue/Monk/Wizard; buff/utility spell policy; item variety with shields + potions; Shield reaction post-hit dispatch) is archived at [docs/changelog/archive-slices-588-592.md](docs/changelog/archive-slices-588-592.md) (slice 596, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 583-587 (spell-coverage aura-damage harness expansion; Rules Lab removal from the web app; combat-fuzz CLI introduction; spell-attack trigger dispatch fix; transcript advantage display fix) is archived at [docs/changelog/archive-slices-583-587.md](docs/changelog/archive-slices-583-587.md) (slice 591, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 580-582 (Option-C closure tail: Deafened auto-fail hearing checks; Frightened movement-gate audit-clarification; minimal encumbrance domain — Petrified ×10 + Goliath Powerful Build) is archived at [docs/changelog/archive-slices-580-582.md](docs/changelog/archive-slices-580-582.md) (slice 590, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 576-579 (auto-fail save consumption; `consumeOnCheck` + `consumeOnSave` primitives + planBardicInspiration + Help-on-check closure; planLayOnHands; the four thin action planners Search / Study / Influence / Utilize) is archived at [docs/changelog/archive-slices-576-579.md](docs/changelog/archive-slices-576-579.md) (slice 586, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 573-575 (per-class L1 end-to-end scenarios; CI-guarded L1 invariants audit; condition behavior tests + INCAPACITATING parity audit) is archived at [docs/changelog/archive-slices-573-575.md](docs/changelog/archive-slices-573-575.md) (slice 584, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 571-572 (planHelp — both Attack + Ability Check modes; planReady) is archived at [docs/changelog/archive-slices-571-572.md](docs/changelog/archive-slices-571-572.md) (slice 582, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 569-570 (Exhaustion attack-roll + Speed penalties — PHB 2024 unified d20-Tests semantic; Incapacitated → concentration-break on apply) is archived at [docs/changelog/archive-slices-569-570.md](docs/changelog/archive-slices-569-570.md) (slice 578, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 567-568 (condition effect-list completeness sweep + three attack-resolution gates: within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage) is archived at [docs/changelog/archive-slices-567-568.md](docs/changelog/archive-slices-567-568.md) (slice 576, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 565-566 (Hex ability-disadvantage rider; Favored Enemy Hunter's Mark pool-based free-cast wiring) is archived at [docs/changelog/archive-slices-565-566.md](docs/changelog/archive-slices-565-566.md) (slice 572, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 562-564 (Eldritch Blast multi-beam scaling; Vicious Mockery disadvantage rider; per-caster L1 spellcasting math test suite) is archived at [docs/changelog/archive-slices-562-564.md](docs/changelog/archive-slices-562-564.md) (slice 569, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 560-561 (Human / Tiefling Medium-or-Small size choice; Druid Magician cantrip choice + deep-audit clarifications) is archived at [docs/changelog/archive-slices-560-561.md](docs/changelog/archive-slices-560-561.md) (slice 567, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 553-559 (Goliath Giant Ancestry × 6 arms cohort + 3 missing focus variants) is archived at [docs/changelog/archive-slices-553-559.md](docs/changelog/archive-slices-553-559.md) (slice 562, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 549-552 (post-L1-audit fixes: Rogue Sneak Attack finesse/ranged weapon gate; Cover bonus on Dex saves; Forest Gnome Speak with Animals per-rest cap; Reach property OA threat range) is archived at [docs/changelog/archive-slices-549-552.md](docs/changelog/archive-slices-549-552.md) (slice 558, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 545-548 (final L1 deep-audit closure cohort: planSecondWind for Fighter L1, Healer's Kit + planUseHealersKit, Savage Attacker audit-clarification, planRage + raging condition for Barbarian L1) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md) (slice 553).

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon; Heroic Inspiration first-class resource; Halfling Luck cohort sweep + helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md) (slice 548).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance; Human Resourceful narrative marker; Halfling Luck primitive + attack arm; Halfling Luck save + check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md) (slice 545).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md) (slice 541).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) (slice 537).

Per-slice detail for slices 520-524 (Spare the Dying + stabilize; Expeditious Retreat + planExpeditiousRetreatDash; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529).

Per-slice detail for slices 517-519 (Pact boon completion arc: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520).

Per-slice detail for slices 506-512 (L1-completion polish arc: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490).

Per-slice detail for slices 472-481 (post-alpha.15 iconic-encounter content sweep) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487).

## 0.1.0-alpha.15 - 2026-05-26

**Release (slice 471): bump to 0.1.0-alpha.15**

Promotes the post-alpha.14 cohort (slices 437-470) to a tagged release. `package.json` bumped from `0.1.0-alpha.14` to `0.1.0-alpha.15`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the cohort's two persisted-shape touches (slice 467 added `turnUsage.savageAttackerUsedThisTurn`, slice 468 added the `InitiativeSwapped` event) are both purely additive with safe defaults, so old saves parse unchanged. The full suite is green; doc-counts + doc-links + doc-size audits all pass.

Cohort, in two arcs:

- **Infra + docs sustainability (437-443):** the active-cycle CHANGELOG invariant that finally stopped the split-treadmill (437, `58.9 KB -> 9.5 KB` by evicting eight frozen release narratives to the per-range archives), the doc-links audit blind-spot fix for empty hrefs that the bulk re-rooting briefly produced (437 also), the broken-link fix in CLAUDE.md (438), the case-only link-mismatch hardening (439), documenting the PR-based `dev` -> `main` integration as standard (440), de-numbering the stale "Layer N" test labels (441), cutting CI turnaround from ~7 min per push to fast per-slice feedback (442), and syncing CLAUDE.md's branch section for fresh-agent readiness (443).
- **L1 playability arc (444-470):** the level-by-level direction shift. Three batches landed: species trait sweep (444-465) - Halfling Brave, Elf Fey Ancestry + Keen Senses, Darkvision / Dwarven Resilience / Gnomish Cunning, Rogue Thieves' Cant + Sprite natural weapons, Wolf / Dire Wolf / Brown Bear / Mastiff knock-prone, Goblin Nimble Escape, Zombie Undead Fortitude, Wizard Ritual Adept, Orc Adrenaline Rush + Relentless Endurance, Kobold Sunlight Sensitivity + the Undead sunlight sweep, Sprite + Ghoul Bite natural weapons, Cleric Turn Undead, monster Multiattack content declaration (canonical user: Ghoul), Human Skillful, Goliath species (closing the last empty playable species); background mechanics (466-469) - backgrounds auto-project their Origin Feat + Sage RAW correction (466), Savage Attacker (467, the Soldier mechanic), Alert (468, the Criminal mechanic), Magic Initiate (Cleric / Wizard) (469, the Sage / Acolyte mechanics); plus CHANGELOG cohort archives (454 → slices 444-450, 460 → slices 451-459, 470 → slices 460-468). Net result: every L1 species has wired traits, every L1 class feature is wired, every 2024 SRD background lights up end-to-end (proficiencies + Origin Feat mechanics) through the slice-466 auto-projection, and the monster Multiattack primitive is shipped for the next-arc encounter sweep.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](docs/changelog/):
- [archive-slices-444-450.md](docs/changelog/archive-slices-444-450.md) (L1 arc part 1)
- [archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md) (L1 arc part 2)
- [archive-slices-460-468.md](docs/changelog/archive-slices-460-468.md) (L1 arc part 3 - background mechanics)
- The pre-arc infra slices (437-443) plus slices 461 + 469-470 remain on the live release narrative below; future archive slices will continue to evict cohorts as they age.

**Content (slice 469): Magic Initiate x 2 (Cleric + Wizard) - Sage and Acolyte light up end-to-end**

The final pair of Origin Feats. After slice 466's auto-projection (background -> effective feat list -> effect stack) and slices 467 / 468's mechanic wiring for Savage Attacker / Alert, the only remaining "background ships with no effect" rows were Sage and Acolyte, both pending their Magic Initiate origin feats. This slice closes both with a pure-content slice: no engine work beyond what the slice-212 `GrantSpell` consumer already does.

RAW (SRD 5.2.1 Magic Initiate):
- **Two Cantrips**: "Learn two cantrips of your choice from the Cleric, Druid, or Wizard spell list."
- **Level 1 Spell**: "Choose a level 1 spell from the same list... You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have."
- **Repeatable**: different list each time. The pack already ships separate `magic-initiate-cleric` / `magic-initiate-wizard` feats, one per list; each background's Origin Feat fixes the list (Acolyte -> Cleric list, Sage -> Wizard list).

**Each feat ships two OfferChoice traits** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)), `when: 'onAcquire'`, each carrying `GrantSpell` per option:
- Cantrip OfferChoice (`oneOf: 2`): over the full SRD list for that class (7 Cleric, 15 Wizard). `preparation: 'always-prepared'` so the chosen cantrips appear on the bearer's effective spell list and can be cast at-will via the existing `cast-spell` planner.
- L1 OfferChoice (`oneOf: 1`): over the full SRD L1 list (15 Cleric, 30 Wizard). `preparation: 'oncePerLongRest'` — the slice-219 marker for "free cast" semantics. The spell still appears on `effectiveSpellList` so it's also castable using slots per RAW; the once-per-long-rest gate is consumer-tracked (same sibling-deferral as the slice-353 Warlock Contact Patron and slice-219 Cleric Divine Intervention).
- `spellcastingAbility`: hard-coded to the canonical default per RAW (`WIS` for Cleric list, `INT` for Wizard list). The player's choice across INT/WIS/CHA is deferred as a future refinement; for the auto-projected origin-feat path, the canonical default is the right out-of-the-box behavior.

**End-to-end through the background pipeline**: a consumer building an Acolyte / Sage character does **not** seed `featsTaken`. The slice-466 auto-projection delivers `magic-initiate-cleric` / `magic-initiate-wizard` to the effect stack from the background's `originFeatId`. The OfferChoice surfaces a pending choice on character acquisition; the consumer resolves it; the GrantSpell entries land on the bearer's `grantedSpells()` accumulator + `effectiveSpellList`.

**Tests** at [tests/unit/engine/slice-469-magic-initiate.test.ts](tests/unit/engine/slice-469-magic-initiate.test.ts) — 7 cases: (1, 2) Acolyte without choices resolved has no granted spells, Acolyte who picks Sacred Flame + Guidance + Cure Wounds has them granted with the right preparation modes and WIS ability; (3) the L1 spell appears on `effectiveSpellList` (castable via slots); (4, 5) Sage equivalents for Wizard list with INT ability; (6, 7) catalog-conformance checks pinning the OfferChoice shapes to the SRD list sizes (7 / 15 cleric, 15 / 30 wizard) so any future spell add / remove that walks past the catalog fails the audit.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Magic Initiate exactly. The cantrip + L1 spell selection arms ship via OfferChoice over the full SRD lists. The "Spell Change at each level" arm (replace one chosen spell on level-up) is deferred — needs a `when: 'onLevelUp'` mode for OfferChoice the engine supports today but the SRD-replace shape is not yet conveyed by the OfferChoice schema. The free-cast-per-long-rest gate is consumer-tracked, matching the established pattern from slices 219 + 353.
- *Names*: `magic-initiate-cleric-cantrips` / `magic-initiate-cleric-l1` (and Wizard variants) mirror the existing `wizard-scholar` / `rogue-expertise-l1` / `rogue-expertise-l6` choice-id naming (subject-feature-variant).
- *DRY*: a single helper in the generator script produces both feats' OfferChoice arrays from the same SRD lists; the pack carries the resulting JSON inline so there's no runtime indirection.
- *SRP*: feat ships the choice surface; OfferChoice + GrantSpell are the existing primitives; `effectiveSpellList` does the union; no engine code touched.
- *Magic numbers*: only the `oneOf: 2` and `oneOf: 1` per RAW; the cantrip / spell counts are content-driven from the SRD lists.
- *Mechanical outcomes asserted*: no-choice-resolved -> no grants; chosen cantrips -> always-prepared; chosen L1 -> oncePerLongRest; spellcasting ability matches list (WIS / INT); spells appear on `effectiveSpellList`; OfferChoice shapes match the SRD list sizes.

**Closes the L1 background arc.** Every 2024 SRD background that ships in the starter pack (Soldier, Sage, Criminal, Acolyte) now lights up end-to-end: ability-score options, skill / tool proficiencies, languages, and Origin Feat mechanics. A consumer building any of the four with default `featsTaken: []` gets the RAW behavior automatically through the slice-466 auto-projection.

**Open follow-ups:**
- ~~**Once-per-long-rest free-cast gate**: a per-feat resource the engine auto-tracks (granted via the GrantSpell `oncePerLongRest` preparation, consumed by a cast with `noSlotCost: true`) would close the consumer-responsibility gap for Magic Initiate's L1-spell free cast, Warlock Contact Patron, and any other future once-per-long-rest cast. Sibling primitive opportunity.~~ **Closed by slice 486.**
- **Spell Change at level-up** (RAW: "Whenever you gain a new level, you can replace one of the spells you chose for this feat"): needs an OfferChoice mode that exposes a "replace one of your prior selections" semantic on level-up. The schema's `when: 'onLevelUp'` is there but the replace-prior-pick shape isn't expressed. *Still open.*
- **spellcastingAbility player choice** (RAW: pick INT/WIS/CHA at feat acquisition): a third OfferChoice on each feat over the three abilities, with each option re-projecting the GrantSpell entries with that ability. Deferred for now; the canonical defaults match the linked backgrounds' ability options. *Still open.*
- ~~**Magic Initiate (Druid)**: not currently in the pack as a feat; would mirror the Cleric / Wizard wiring over the Druid list once that list is fully present.~~ **Closed by slice 485.**

**Docs (slice 470): archive slices 460-468 (L1 background-mechanics arc) to free CHANGELOG headroom**

Pure CHANGELOG-archive operation. The live CHANGELOG had reached 62 KB after the slice-466 / 467 / 468 / 469 background arc — over the comfortable single-Read threshold. Moved the nine-slice cohort 460-468 to [docs/changelog/archive-slices-460-468.md](docs/changelog/archive-slices-460-468.md), continuing from [docs/changelog/archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md) (L1 arc part 2). Slice 469 stays inline as the most-recent slice. Live CHANGELOG drops to ~25 KB; archive holds the full per-slice detail with sibling-rooted links (`../../src/...`, `../../tests/...`). Archive index in [docs/changelog/README.md](docs/changelog/README.md) updated.

**Docs (slice 443): sync CLAUDE.md's branch section to the PR flow (fresh-agent readiness)**

CLAUDE.md is the auto-loaded manual a fresh agent reads first, but its "Branch structure" still described the old "user merges `dev` into `main` on his cadence" local-merge framing and never mentioned the PR-based integration adopted in slice 440 (only DEVELOPMENT.md did). A fresh agent would get the correct "don't push without instruction" rule but a stale mental model of *how* integration happens. Updated [CLAUDE.md](CLAUDE.md) "Branch structure" to state `dev` integrates into `main` only through a CI-gated PR (with the `gh pr create` command + the per-push-vs-PR-gate split from slice 442), pointing to DEVELOPMENT.md for the full flow; broadened the git-safety line to "don't push, open a PR, or merge to `main` without instruction." Also fixed a stale parallel-authoring summary line that said "engine on `main`" (contradicting the dev-only rule; the underlying parallel-authoring.md was corrected in slice 433 but this CLAUDE.md summary wasn't). Pattern-checked the front-door docs for other local-merge framing: none remain. No code/content/public-surface change.

**Infra (slice 442): cut CI turnaround (~7 min per push -> fast per-slice feedback)**

CI ran a 3-way Node matrix (20/22/24) where every entry did `npm ci` + typecheck + coverage-instrumented suite + build, so the expensive trio ran 3x, with no concurrency cancellation (a re-push left the stale run going). Restructured [.github/workflows/ci.yml](.github/workflows/ci.yml) so the felt per-slice cost drops without weakening the gate on `main`:

- **Fast per-push `test` matrix**: Node 20/22/24 each run `npm test` (`vitest run`, no coverage) on every push/PR. Cross-Node compatibility is still exercised on all three; coverage % is Node-invariant for this no-native-deps library, so it no longer runs 3x.
- **Integration-time `quality` job**: typecheck + coverage (80% thresholds) + build, once on Node 22, gated via `if:` to pull requests and pushes to `main`. Routine `dev` pushes skip it; `main` is never shipped without it (dev -> main is PR-only). The CI coverage run drops the `html` reporter (text + json-summary suffice; thresholds read json-summary); local `npm run test:coverage` still emits html.
- **Concurrency cancellation**: a top-level `concurrency` group keyed on workflow + ref cancels a ref's in-flight run on re-push (no more ~14-min double-waits). Does not affect the deploy-*.yml workflows.
- **Nightly deep fuzz**: new [.github/workflows/nightly-fuzz.yml](.github/workflows/nightly-fuzz.yml) runs the property suite at `FAST_CHECK_NUM_RUNS=1000` on a daily schedule (+ manual dispatch), so deep fuzzing is continuous instead of never-in-CI while per-push fuzz stays at the smoke level (50).
- **`structuredClone` in [tests/property/content-pack-validator.test.ts](tests/property/content-pack-validator.test.ts)**: replaces the `JSON.parse(JSON.stringify())` whole-pack deep clone done each fast-check iteration. Identical semantics on the plain-JSON pack; the file drops from ~43s to ~36s (the per-iteration Zod parse of the full pack, not the clone, is the remaining dominant cost) and the local pre-commit suite benefits too.

Quality is preserved: no tests deleted, coverage thresholds enforced before any merge to `main`, replay / RNG-capture / contract layers all still run, and local pre-commit still runs the full `vitest run` + `tsc` per slice. Documented the per-push-vs-gate split in DEVELOPMENT.md. Deliberately not done (low-risk bundle): test sharding + coverage-merge (the lever for sub-3-min single-run wall-clock, more plumbing) and hardcoding vitest `maxForks` (helps a 4-vCPU runner but can slow many-core local machines). No engine/content/public-surface change.

**Infra (slice 441): de-number the stale "Layer N" test labels (closes the slice-435 follow-up)**

Test-file headers and a few docs carried "Layer N" labels from an older 9+-layer testing scheme that no longer matched CLAUDE.md's current 1-7 Required-layers list (property tests were "Layer 7" and the feature-coverage matrix "Layer 8", but neither is a required layer; replay / RNG were "Layer 5 / 6" but are now 4 / 5). The numbers had drifted twice, so rather than re-number (which re-bitrots on the next reorder) the labels are now **de-numbered** to reference the standard by name. Updated `tests/property/*.test.ts` (7 files), `tests/coverage/features.test.ts`, and the `describe` labels in `tests/golden/{s2-combat-round,replay-equivalence,rng-capture}.test.ts` + `tests/integration/property.test.ts`; reconciled the stale inventory in [docs/status.md](docs/status.md) (was citing "Layers 5-11") and [docs/web-demo-plan.md](docs/web-demo-plan.md) ("Layer 9 contract test"); softened the one CLAUDE.md cross-reference. Left untouched by design: the SRD audit's own internally-consistent "Layer 1-4" scheme ([docs/srd-5.2.1-audit-classes.md](docs/srd-5.2.1-audit-classes.md), a different domain) and the frozen CHANGELOG archives (historical record). Verified the de-numbered `describe` labels carry no snapshot keys (only `tests/coverage/features.test.ts` uses snapshots, and only its comment changed) and the affected tests pass. No code/content/public-surface change.

**Docs (slice 440): document the PR-based dev -> main integration as standard**

Adopted a pull-request integration flow for `dev` -> `main` (replacing the local `git merge` that shipped a broken doc link straight to a red `main` in the slice-438 episode). Updated DEVELOPMENT.md: the "Branches" / "Working flow" now states that `main` is integrated only through a CI-gated PR (`gh pr create --base main --head dev`, merge when green), the branch-from rules note `dev` is the sole branch that integrates into `main` (via PR), and the "Cutting a release" step 7 ships through the PR before tagging on the merged `main`. The git-safety rule is unchanged: the PR process changes *how* `dev` integrates into `main`, not the rule that a human authorizes the push / PR / merge. Doc-only.

**Infra (slice 439): doc-links audit now catches case-only link mismatches**

The third and last of the "passes on a dev Mac, fails on Linux CI / GitHub" link classes (after empty hrefs in slice 437 and repo-escaping links in slice 438). macOS resolves `[x](docs/Status.md)` against the real `docs/status.md` (case-insensitive filesystem), so a wrong-case link passed the audit locally but would 404 on case-sensitive Linux CI and on GitHub. [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) now resolves each within-repo link by walking its path segments and requiring an exact-case match at each level (replacing the case-insensitive `existsSync`); on a mismatch it reports the correct casing (e.g. "case mismatch: should be docs/status.md"). Also dropped a stale unused `statSync` import. Verified it catches both wrong-case directory and wrong-case file segments and still passes clean. No code/content change.

**Fix (slice 438): CI doc-links failure - repo-escaping link in CLAUDE.md**

The doc-links audit failed in CI (but not locally): the project CLAUDE.md linked the global house-style file as `[~/.claude/CLAUDE.md](../../../.claude/CLAUDE.md)`, a path that resolves *above* the repo root. It passed on the dev machine (whose home dir has `~/.claude/CLAUDE.md` at exactly that relative position) but 404s in CI and on GitHub, neither of which can escape the repo. Two fixes: (1) the global config isn't a repo file, so it's now referenced as plain `~/.claude/CLAUDE.md` code text rather than a dead link; (2) hardened [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) to flag any link resolving above the repo root as broken, deterministically, so a non-portable link can no longer pass locally and fail in CI. Verified the audit catches an injected repo-escaping link and still passes clean. No code/content change.

**Docs (slice 437): make the CHANGELOG sustainable - live file holds only the active cycle**

The live CHANGELOG kept hovering at 57-59 KB despite repeated "splits" because the splits only moved per-slice *detail* to cohort archives while eight frozen release narratives (alpha.6-13, ~84% of the bytes) plus a 33-entry archive index stayed inline forever; each split reclaimed detail but added a pointer, so the floor never dropped. Restructured to an active-cycle-only invariant: the live CHANGELOG now holds only `## Unreleased` + the latest tagged release + a compact "Older releases" pointer (58.9 KB -> 9.5 KB). Evicted the alpha.6-13 release narratives to [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md) and moved the global per-cohort archive index to [docs/changelog/README.md](docs/changelog/README.md), both link-re-rooted and under the ceiling. Codified the rule in CLAUDE.md "Doc size discipline" (on every release, evict the previously-latest release narrative + its cohort pointers; released narratives split by version range as they grow) and added the eviction step to the DEVELOPMENT.md "Cutting a release" checklist. The bulk re-rooting surfaced (and the slice fixed) a blind spot in [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts): its link regex required a non-empty href, so an empty `[text]()` link (which renders dead on GitHub, and which the re-rooting briefly produced) slipped through; hardened it to flag empty hrefs. Test-only audit change otherwise; doc-links + doc-size green.


## Older releases

Tagged release `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
