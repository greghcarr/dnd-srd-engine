# Archive: slices 593-598

Six slices of combat-fuzz tooling expansion: per-character level-up to L2-5 (593), out-of-combat rest cycles (594), 2v2 multi-combatant mode (595), PC vs Monster mode (596), monster variety with 10 L1-appropriate statblocks (597), and Bonus-Action policy slot for species + class L1 BAs (598).

Evicted from the live CHANGELOG in slice 600 (active-cycle headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Tooling (slice 598): combat-fuzz Bonus-Action policy slot — species + class L1 BAs**

The fuzz policy's first-turn buff slot (step 2 in `pickIntent`) handled only four BA-cast spell-buffs (Rage, Hunter's Mark, Hex, Divine Favor) and the cantrip-attack action loop. The L1 species + class **bonus-action features** — Orc Adrenaline Rush, Dwarf Stonecunning, Dragonborn Breath Weapon, Sorcerer Innate Sorcery, Bard Bardic Inspiration — were all granted as resources on the character but never invoked by the fuzz's bug-discovery loop.

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
- New `firstTurnSpeciesBATried` flag on `Combatant` (parallel to `firstTurnBuffTried`).
- `pickIntent` signature extended with an `allies: ReadonlyArray<Combatant>` argument (defaults to `[]`). The runBattle loop populates it from the active's team minus self, filtered by alive HP — empty in 1v1, populated in 2v2.
- New step 2b in `pickIntent` (after the existing step 2 BA buffs, before the action buffs in step 2c):
  - **Orc** → `AdrenalineRush` (BA Dash + temp HP = profBonus) — costs 1 `adrenaline-rush` resource (slice 588 ensures it's granted from `species.traits`).
  - **Dwarf** → `Stonecunning` (BA tremorsense) with `onStoneSurface: true` (the engine doesn't track surfaces; the consumer asserts it). Costs 1 `stonecunning` resource.
  - **Dragonborn** → `DragonbornBreath` with `damageType: 'acid'` + `areaShape: 'cone'` + `targetIds: [opponentId]`. Acid is the slice-593-auto-picked Black ancestry's damage type; cone is RAW's "size 5" wider cone. Costs 1 `dragonborn-breath-weapon` resource.
  - **Sorcerer Innate Sorcery** → returned with sentinel intent type, dispatched directly via `engine.plan.innateSorcery(...)` in `runBattle` (the planner is on `EXCLUDED_FROM_DISPATCH` allowlist, mirror of slice 592 Shield + slice 591 ConsumeItem). Costs 1 `innate-sorcery` resource.
  - **Bard Bardic Inspiration** → `BardicInspiration { bardId, recipientId }` targeting the first alive ally. Only fires in 2v2+ (1v1 has empty `allies`). Costs 1 `bardic-inspiration` resource.

**Bug surfaced and fixed during build**: my first cut used `targetId` for the Bardic Inspiration intent; the schema field is `recipientId`. Same shape as the slice-593 field-name drift bugs (slice 587-flavor). Fixed; pattern-check across other intent shapes in the fuzz finds no further matches.

**Verification:**
- **1v1 mode** (30 seeds, seeds 1300-1329): 4 Adrenaline Rush firings + 4 Stonecunning firings + 3 Breath Weapon firings + 3 Innate Sorcery firings across the batch. Each fires the resource spend + the condition / event chain.
- **2v2 mode** (30 seeds, seeds 1500-1529): Bardic Inspiration confer-to-ally fires correctly ("Aria-1 spends 1 bardic-inspiration" → "Aria-2 is now Bardic Inspiration"), and the recipient ally subsequently consumes the die on their next attack/save/check.
- **Full suite green**: 479 test files, 3246 passing, 173 unrelated skips.

**Audit:**
- **Names:** `firstTurnSpeciesBATried` parallels existing `firstTurnBuffTried` / `firstTurnActionBuffTried`; the per-branch tokens use the engine's planner names.
- **DRY:** all five branches share the same `c.resources.find((r) => r.resourceId === ...)` + `current > 0` gate.
- **SRP:** tooling only; no engine, content, schema, or test changes.
- **Magic numbers:** none added.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** live fuzz verification (each of 5 BAs fires; resource spend visible in transcripts; subsequent rolls show the condition / effect).

**Pattern-check (filter shape: "BA features granted to L1 characters but unexercised"):** the L1 species / class BAs the engine has planners for:
- Adrenaline Rush (orc) ✓
- Stonecunning (dwarf) ✓
- Dragonborn Breath ✓
- Innate Sorcery (sorcerer) ✓
- Bardic Inspiration (bard) ✓
- Rage (barbarian) — already in slice 588's step 2
- Hunter's Mark (ranger) — already in slice 588's step 2
- Hex (warlock) — already in slice 588's step 2
- Divine Favor (paladin) — already in slice 590's step 2

Goliath Giant Ancestry (BA varies by lineage — 6 sub-options) is the one remaining unexercised L1 species BA; deferred since it needs per-lineage dispatch (Cloud's Jaunt, Storm's Thunder, Fire's Burn, etc.).

L1 SRD active-feature coverage went from **~40% → ~70%** with this slice (every L1 class + species BA except Goliath Giant Ancestry now exercised).

---

**Tooling (slice 597): combat-fuzz monster variety — 10 L1-appropriate statblocks**

Slice 596 introduced `--vs monster` mode with a single Wolf as the only opposing monster, leaving the rest of the engine's L1-CR statblock surface unexercised. The pack has 14+ monsters at CR ≤ 1 with already-wired natural-weapon items; slice 597 picks 10 with diverse trait coverage and adds them to `MONSTER_OPTIONS`.

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)): `MONSTER_OPTIONS` expanded from 1 → 10 entries:

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

Each entry maps an `id → weaponId → ClassBuild` (with the natural weapon as the wielded item). The fuzz tool's `buildMonster` already mirrors the engine's [src/engine/triggers/dispatch.ts:485-546](../../src/engine/triggers/dispatch.ts#L485-L546) `fireSpawnCreature` path; the slice 597 work is pure data expansion.

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

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
- New `--vs pc|monster` CLI flag (default `pc`). With `monster`, team B is built from `MONSTER_OPTIONS` (currently just the Wolf with `wolf-bite` natural weapon; structured for easy extension).
- New `buildMonster(name, pack, rngFloat)` builds a `Character` snapshot from the pack's `MonsterStatblock` schema, mirroring [src/engine/triggers/dispatch.ts:485-546](../../src/engine/triggers/dispatch.ts#L485-L546) `fireSpawnCreature` (the canonical engine path for instantiating a monster mid-combat). HP = `statblock.hp.average`, AC = `statblock.ac`, ability scores + speed copied; the natural weapon is created as an `ItemInstance` and equipped main-hand so the standard `engine.plan.attack` chain fires.
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

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
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

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
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

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
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
