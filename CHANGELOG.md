# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Docs (slice 395): reconcile the front-door test/file count**

A deep doc-currency pass. The CI-guarded counts (doc-counts, gaps-spells-counts, doc-size, pack-integrity) were all green, and the per-category narrative in [docs/srd-5.2.1-audit-classes.md](docs/srd-5.2.1-audit-classes.md) is current through the slice 383 Evoker Potent Cantrip wire. The one stale figure was the unguarded headline test/file count: README.md and docs/status.md (two spots) cited "2070 tests across 311 files" from before the alpha.12 release, while the suite now runs 2170 passing across 331 files. Updated all three. No code or content change; the test/file total is intentionally not auto-guarded (it moves every slice), so it gets a manual eye on doc passes like this one. doc-counts + doc-size + gaps-spells-counts green.

**Engine (slice 394): Rogue Withdraw is a half-Speed no-provoke budget, not a full-turn Disengage**

Converted the last documented Cunning Strike deviation. Withdraw emitted a plain `Disengaged`, which suppressed Opportunity Attacks for the rogue's WHOLE turn of movement; RAW grants only "move up to half your Speed without provoking." Added a per-turn `noProvokeMovementUpToFeet` high-water-mark to `turnUsage` (reset at TurnStarted alongside the other per-turn flags). The `Disengaged` event gained an optional `limitedToFeet`: when set, the reducer stamps the mark (`feetMovedThisTurn + limitedToFeet`, taking the max so a second Withdraw can't shrink an existing window) instead of the full-turn `disengaged` flag. The move planner now suppresses OA provocation when either `disengaged` is set OR the cumulative travel (`feetMovedThisTurn + distance`) stays within the mark, so movement past half Speed provokes from the foot that leaves reach. The Withdraw arm of `buildCunningStrikeEffects` emits `Disengaged { limitedToFeet: floor(getEffectiveSpeed/2) }`.

This piggybacks on the existing `feetMovedThisTurn` budget rather than a separate decrement, so a rogue who Withdraws then takes several short steps gets exactly half their Speed of no-provoke movement total. The full-turn Disengage action (no `limitedToFeet`) is unchanged.

Uncle Bob audit (engine slice): **Names** `noProvokeMovementUpToFeet` / `limitedToFeet` / `withinNoProvokeBudget` say what they hold. **DRY** the budget check reuses the move's already-computed `distance` and the existing `feetMovedThisTurn`; the reducer's max-merge is one line. **SRP** the reducer stamps the mark, the planner reads it, the cunning-strike module owns the half-Speed math (via the shared `getEffectiveSpeed`). **Magic numbers** none new; half-Speed cites RAW. **at-threading** unchanged (the Disengaged event carries the planner's single `at`). **Mechanical outcomes asserted** four cases: Withdraw emits `limitedToFeet = floor(Speed/2)`, a 15 ft move out of reach with the mark doesn't provoke, a 20 ft move does, and the baseline (no mark) provokes. **Tests** each pins the distance gate the old full-turn flag couldn't express. No content change. No em/en dashes. `tsc --noEmit` clean; full suite green (331 files / 2170 passing).

**Docs (slice 393): archive CHANGELOG slices 386-391 (single-Read ceiling)**

The live CHANGELOG had climbed to ~59 KB across the deviation-conversion cohort, approaching the 60 KB single-Read ceiling. Per the doc-size discipline playbook, moved the per-slice detail for slices 386-391 (the full-RAW deviation conversions) to [docs/changelog/archive-slices-386-391.md](docs/changelog/archive-slices-386-391.md) (13 KB), leaving slice 392 inline plus the pointer below. Root-relative links rewritten for the archive's `docs/changelog/` location; the archive-index block gained the new file. No code or content change; docs only. doc-size + doc-counts audits green; live CHANGELOG back to ~47 KB.

**Engine (slice 392): Flurry / Multiattack thread state across strikes**

Took on the last of the documented deviations. `planFlurryOfBlows` and `planMultiattack` resolved every strike against the original pre-action state, so each strike saw the same world: a one-shot condition on the attacker (Sap / Vex) wrongly applied to all strikes rather than just the first, a Prone applied by an earlier strike (Open Hand Topple) didn't grant advantage to the next, and the target's HP wasn't threaded. Both planners now carry a `workingState` (`applyAll(state, eventsSoFar)`) and resolve each strike against it, so a strike sees the prior strikes' effects. `apply` is pure, so this stays replay-deterministic.

This is the RAW-correct one-shot semantics for a multiattacker: a creature Sapped before its turn now rolls Disadvantage on only its first attack (the showcase's Stoneheart multiattack lost two spurious `[disadvantage]` swings and two redundant "no longer Sapped" lines). It also lets Open Hand Technique's Topple-induced Prone and Push-induced reposition affect the same flurry's later strikes.

Uncle Bob audit (engine slice): **Names** `workingState` reads as what it is. **DRY** both planners use the same `applyAll`-per-strike threading; the flurry's open-hand follow-up already built post-strike state, now folded into the running state. **SRP** the planners own strike sequencing; `resolveAttack` is unchanged. **Magic numbers** none. **Mechanical outcomes asserted** a Sapped monk's 3-strike Flurry rolls Disadvantage on only the first strike and removes `sapped` exactly once; an HP-threaded Flurry resolves cleanly. **Tests** the one-shot-per-multiattack semantics the stale state got wrong; the showcase transcript regenerated (only the expected roll cascade + the removed spurious lines; replay-equivalence held). No content change. No em/en dashes. `tsc --noEmit` clean; full suite green.

**Slices 386-391**: per-slice detail archived to [docs/changelog/archive-slices-386-391.md](docs/changelog/archive-slices-386-391.md) (moved in slice 392 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the full-RAW conversions of documented deviations - the "Large or smaller" size gate (386), Sap/Vex one-shot (387), the per-instance fixed-DC recurring save (388) + Intimidating Presence repeat save (389), Absorb Elements slot scaling (390), and per-instance "ends on damage" for Sleep + Knock Out (391).

**Slices 381-385**: per-slice detail archived to [docs/changelog/archive-slices-381-385.md](docs/changelog/archive-slices-381-385.md) (moved in slice 387 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the inert-weapon-masteries fix + emitted-but-undefined audit (381), a CHANGELOG archive split (382), Evoker Potent Cantrip (383), and the Rogue Cunning Strike family (384 Cunning Strike + Improved, 385 Devious Strikes).

**Slices 376-380**: per-slice detail archived to [docs/changelog/archive-slices-376-380.md](docs/changelog/archive-slices-376-380.md) (moved in slice 382 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the matchWalkSpeed "equal to your Speed" sweep (376), the srd-drift class-progression-table extension (377), and the three slice-377 feature-presence closures (378 Weapon Mastery on Barbarian/Fighter/Paladin + the Flex resolution, 379 Monk Heightened Focus, 380 Monk Open Hand Technique).

## 0.1.0-alpha.12 - 2026-05-21

**Release (slice 375): bump to 0.1.0-alpha.12**

Promotes the post-alpha.11 cohort (slices 345-374) to a tagged release. `package.json` bumped from `0.1.0-alpha.11` to `0.1.0-alpha.12`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1 (no persisted-shape changes - the cohort added content and content-schema fields, not runtime-state shapes). The suite is green at 320 files / 2114 passing.

Cohort highlights, in three arcs:

- **Subclass features (345-360):** closed the Tier-A subclass spell-grant queue and wired a run of post-L3 features - Hunter Colossus Slayer (the new `event.targetMissingHp` fact), Fiend Dark One's Blessing (the new `GrantTempHP` trigger action), the L14 Intimidating Presence + Dragon Wings, Life Domain Preserve Life, Circle of the Land Land's Aid, Warrior of the Open Hand Wholeness of Body, College of Lore Peerless Skill, Evoker Empowered Evocation (the new `event.spellSchool` damage fact), and Oath of Devotion's Aura of Devotion ally-half.
- **CI guard suite (361-365):** a project-wide doc reconciliation plus five permanent audits that close recurring drift classes at commit time - count-drift (doc counts vs source), content cross-reference resolution, effect-less conditions on wired spells, planner-wiring (every `engine.plan` method dispatch-routed or allowlisted), and Custom-handlerId backing.
- **Two bug-class arcs (366-374):** the empty-effect-condition class (Hideous Laughter now action-blocking; Bestow Curse's ability + inactive-turn arms; the Resistance cantrip's 1d4 reduction) and the phantom-field-strip class (three save spells that dealt zero damage, five melee spell attacks mistagged ranged, Ray of Frost / Shocking Grasp that didn't scale, 52 dropped item descriptions), each closed and permanently guarded - the spell schemas are now `.strict()`, a phantom-field audit deep-diffs the whole pack, and srd-drift gained four monster secondary-field checks.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](docs/changelog/) (slices 345-373) plus the slice-374 entry below.

**Audit: guard monster secondary defensive fields against SRD drift (slice 374)**

Investigated a bug class - monster secondary-field drift. The SRD-drift audit checked only AC / HP / CR / ability scores for monsters; condition immunities, damage immunities, damage resistances, and Speed got a one-time sweep at slices 154-163 but the ~100 monsters added since (batches 5.x) were unguarded. A fresh sweep of all 235 SRD-matched monsters found the **content is clean** on all four fields (zero drift) - but unguarded. Per the "promote a repeatable sweep to a permanent audit" norm, extended [tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts) with four monster checks: condition immunities, damage immunities, damage resistances, and walk speed, parsed from the merged 2024 `**Immunities**` line (damage types before the `;`, conditions after), the `**Resistances**` line, and the `**Speed**` line.

Parsing uses word-boundary token matching, which distinguishes "Poison" (damage) from "Poisoned" (condition) and tolerates parenthetical qualifiers (Vampire Familiar's "Charmed (except from its vampire master)", Archmage's "Charmed (with Mind Blank)") - both of which a naive split would have false-flagged. Fly/swim-only statblocks (no walk Speed) are skipped on the speed check. srd-drift goes from 17 to 21 checks; all green.

No content or engine change. Uncle Bob audit (audit slice): **Names** `RAW_CONDITION_NAMES` / `DAMAGE_TYPE_NAMES` / `wordBoundaryMatches` / `setEq` read as what they do. **DRY** one `wordBoundaryMatches` helper + one `setEq` shared by all four checks; the four parse from the same header block. **SRP** each check asserts one field across the pack (the established srd-drift shape). **Magic numbers** none. **Tests** the four checks lock in correctness for 235 monsters and catch a future statblock authored with wrong immunities / resistances / speed. No em/en dashes. `tsc --noEmit` clean; full suite green.

**Slices 366-373**: per-slice detail archived to [docs/changelog/archive-slices-366-373.md](docs/changelog/archive-slices-366-373.md) (moved in slice 374 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Two bug-class arcs: the empty-effect-condition class (366 Hideous Laughter, 367 Bestow Curse ability arm, 368 inactive arm, 369 Resistance cantrip) and the phantom-field-strip class (370 zero-damage save spells, 371 melee-spell-attack mistagging, 372 cantrip non-scaling, 373 item descriptions + the permanent phantom-field audit).

**Slices 361-365**: per-slice detail archived to [docs/changelog/archive-slices-361-365.md](docs/changelog/archive-slices-361-365.md) (moved in slice 369 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the project-wide doc reconciliation (361) + the count-drift audit (362), the content cross-reference + effect-less-condition guards (363), the planner-wiring guard (364), and the Custom-handlerId backing guard (365).

**Slices 354-360**: per-slice detail archived to [docs/changelog/archive-slices-354-360.md](docs/changelog/archive-slices-354-360.md) (moved in slice 363 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the subclass-feature wires Land's Aid (354), Wholeness of Body (357), Peerless Skill (358), Empowered Evocation + the `event.spellSchool` fact (359), and Aura of Devotion's ally-half (360), plus the CHANGELOG archive splits 355 + 356.

**Slices 352-353**: per-slice detail archived to [docs/changelog/archive-slices-352-353.md](docs/changelog/archive-slices-352-353.md) (moved in slice 355 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: Life Domain L3 Preserve Life (352, a Channel-Divinity heal-pool planner restoring 5x cleric level HP among bloodied targets, each capped at half its HP max) and a CHANGELOG archive split (353, slices 350-351 moved out).

**Slices 350-351**: per-slice detail archived to [docs/changelog/archive-slices-350-351.md](docs/changelog/archive-slices-350-351.md) (moved in slice 353 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the L14 Tier-B subclass features Path of the Berserker Intimidating Presence (350, a bonus-action WIS-save-or-Frightened planner) and Draconic Sorcery Dragon Wings (351, a fly-speed self-buff).

**Slices 345-349**: per-slice detail archived to [docs/changelog/archive-slices-345-349.md](docs/changelog/archive-slices-345-349.md) (moved in slice 350 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the subclass-doc reconciliation (345); the Tier-A subclass spell-grant wires closing that queue (346 Devotion Spells + Draconic Resilience HP, 347 Evocation Savant); and the first Tier-B subclass features (348 Hunter Colossus Slayer via the new `event.targetMissingHp` fact, 349 Fiend Dark One's Blessing via the new `GrantTempHP` trigger action + DamageApplied source attribution).

## 0.1.0-alpha.11 - 2026-05-20

**Release (slice 344): bump to 0.1.0-alpha.11**

Promotes the post-alpha.10 cohort (slices 329-343) to a tagged release. `package.json` bumped from `0.1.0-alpha.10` to `0.1.0-alpha.11`; `package-lock.json` updated to match. Cohort highlights: the spell-gaps catalog reconciliation + a permanent per-level count audit (337); the new `hp-threshold` spell mechanic with Power Word Kill and Power Word Stun, plus a latent Hold Person action-blocking fix (338-339); the multi-damage `save` extension with Flame Strike (341); the dedicated `planDimensionDoor` teleport planner (342); Enthrall wired (343); and earlier, the `AddBonusDie` primitive making Bless/Bane fully RAW and the Monk's Focus bonus-action trio that closed the last deferred main-class feature (329-336, archived). Spell coverage climbed to 194 wired / 70 narrative / 87 deferred. Per-slice detail for slices 329-336 lives in [docs/changelog/archive-slices-329-336.md](docs/changelog/archive-slices-329-336.md) (slice 340) and for slices 337-343 in [docs/changelog/archive-slices-337-343.md](docs/changelog/archive-slices-337-343.md) (moved in slice 356).

**Slices 337-343**: per-slice detail archived to [docs/changelog/archive-slices-337-343.md](docs/changelog/archive-slices-337-343.md) (moved in slice 356 when the live CHANGELOG approached the 60 KB single-Read ceiling). Cohort summary: the spell-gaps catalog reconciliation + a permanent per-level count audit (337); the `hp-threshold` spell mechanic with Power Word Kill + Power Word Stun, plus a latent Hold Person action-blocking fix (338-339); the multi-damage `save` extension with Flame Strike (341); the dedicated `planDimensionDoor` teleport planner (342); and Enthrall wired (343).

**Slices 329-336**: per-slice detail archived to [docs/changelog/archive-slices-329-336.md](docs/changelog/archive-slices-329-336.md) (moved in slice 340 when the live CHANGELOG approached the 60 KB single-Read ceiling). Cohort summary: the SRD-compliance docs accuracy sweep (329); the `AddBonusDie` effect kind making Bless/Bane fully RAW on both attack (330) and save (331) arms, plus its sibling-claim correction (332); the Monk's Focus bonus-action trio, Flurry of Blows (333), Patient Defense (334), and Step of the Wind (335), which closed the last deferred SRD main-class feature (0 remaining); and the deferred-primitives-backlog doc split (336).

## 0.1.0-alpha.10 - 2026-05-20

Promotes the post-alpha.9 cohort (slices 315-328) to a tagged release. `package.json` bumped from `0.1.0-alpha.9` to `0.1.0-alpha.10`; `package-lock.json` regenerated via `npm install --package-lock-only`. Per-slice detail for slices 315-322 is archived to [docs/changelog/archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md) (slice 326). Cohort summary:

- **Magic equipment became real equipment** (stages 1-3, slices 315-317): single-base magic armor `magic`→`armor`, single-base magic weapons `magic`→`weapon`, and multi-base magic equipment via the `enchantmentDefinitionId` enchantment overlay. The AC derive, attack planner, effect projection, and magicality detector all read the overlay.
- **On-hit weapon-rider trigger family** (slices 318-325): an `onHit` rider can carry extra `dice`, a target-gated `condition` predicate, a `save` arm (`conditionOnFail` / `conditionOnSuccess` / `destroyOnFail` / `hpThreshold`), an unconditional `applyConditionId`, an unconditional `destroy` arm, and a `requiresCritical` crit-gate — all composable. A new `CreatureDestroyed` event models instant death bypassing death saves. Canonical users: Sun Blade, Mace of Disruption (destroy-or-Frighten), Ghoul's Claw, Couatl's Bite, the Wyvern / Ettercap / Merrow poison sweep, Sword of Life Stealing (crit), Mace of Smiting (crit + Construct auto-destroy). Slice 320 unified all four save-roll sites on a shared `rollSaveAgainstDC` helper.
- **Doc hygiene** (slices 326-327): archived the 315-322 per-slice detail when the live CHANGELOG approached the 60 KB single-Read ceiling; refreshed the README + status.md counts to current state.

Net across the cohort: 1908 → 1951 tests across 288 files; item recategorization (weapons 39 → 52, armor 13 → 22, consumables 52 → 69, magic items 292 → 258 as single-/multi-base magic equipment moved to their real categories); one new event type (`CreatureDestroyed`); `EFFECT_KINDS` unchanged at 51 (50 primitives + `Custom`). tsc clean; full suite green; doc-size + SRD-drift + pack-integrity + RAW-compliance audits all green.

**Release: bump to 0.1.0-alpha.10 (slice 328)**

Version bump + this CHANGELOG release block + tag `v0.1.0-alpha.10`. No code change. The previous `## Unreleased` heading became `## 0.1.0-alpha.10 - 2026-05-20`; a fresh empty `## Unreleased` sits above for the next cohort.

**Docs: refresh README + status.md numbers to current state (slice 327)**

Accuracy pass: corrected stale counts that had drifted across the magic-equipment + rider work — test count (1833/268 → 1951/288), item totals (weapons 39 → 52, armor 13 → 22, consumables 52 → 69, magic 292 → 258), magic-item wiring (~86/292 → ~91/258), spell wiring (reconciled the 147-vs-160 inconsistency to the actual 164 via `mechanicalEffects`), conditions (reconciled the 102-vs-98 inconsistency to 116 = 15 RAW + 101 rider), and the `EFFECT_KINDS` off-by-one (50 primitives + `Custom` = 51 entries). Docs only; doc-size audit green.

**Docs: archive slices 315-322 per-slice detail (slice 326)**

The live CHANGELOG had climbed to 48 KB (approaching the 60 KB single-Read ceiling) across the post-alpha.9 cohort. Per the doc-size discipline playbook, the per-slice detail for the magic-equipment + on-hit-rider arc (slices 315-322) moved to [docs/changelog/archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md); the live file keeps a cohort summary + pointer (below) and the most recent three slices (323-325) inline. The archive pointer-block index gained the new file. No code or content change; docs only. doc-size audit green; live CHANGELOG back to ~27 KB.

**Engine + content: unconditional destroy rider arm + Mace of Smiting (slice 325)**

Adds the no-save sibling of slice 323's save-gated destroy, completing Mace of Smiting (crit damage tiers + the Construct auto-destroy).

Engine:
- The `onHit` rider gains an optional `destroy: { hpThreshold? }` arm. When the rider fires (its gates pass) and the target's HP AFTER the hit's damage is at or below `hpThreshold` (or always, when omitted), the target is destroyed (`CreatureDestroyed`, bypassing death saves) — no save, unlike slice 323's `save.destroyOnFail`. Parallels how `applyConditionId` is the unconditional sibling of `save.conditionOnFail`.
- The planner factored a `destroyTarget()` closure (reused by the save-gated and unconditional destroy paths) and an `hpWithin(threshold)` helper over the once-computed post-damage HP (shared by `save.hpThreshold` and `destroy.hpThreshold`).

Content (canonical user): **Mace of Smiting** — its existing `itemKind: 'weapon'` entry gains two crit riders (slice 324 `requiresCritical` + the `0d6+N` flat shape): "+7 Bludgeoning on a 20, or +14 if it's a Construct" (gated `not Construct` / `eq Construct`), and the Construct rider carries `destroy: { hpThreshold: 25 }` for "If a Construct has 25 Hit Points or fewer after taking this damage, it is destroyed."

Deferred: the "+3 vs a Construct" attack/damage bonus is a predicate-gated *base* enhancement (every hit, not just crits), a distinct primitive from the onHit riders — still deferred.

Uncle Bob audit: **Names** — `destroy` / `hpThreshold` mirror the save arm's vocabulary; `destroyTarget` / `hpWithin` are intention-revealing. **DRY** — extracted `destroyTarget` (was an inline literal in the save branch) and `hpWithin` over a single post-damage-HP read, both now shared by the save-gated and unconditional paths. **SRP** — schema arm, planner emission, content wiring each in their layer. **Magic numbers** — 7 / 14 / 25 / Construct are RAW-cited on the item. **at-threading** — `CreatureDestroyed` carries the planner's single `at`; no new RNG. **Mechanical outcomes asserted** — a crit vs a Humanoid adds +7 flat bludgeoning and no destroy; a non-crit adds nothing; a crit vs a high-HP Construct adds +14 but doesn't destroy (over threshold); a crit that leaves a Construct at <= 25 HP destroys it (hp 0, 3 failures) with replay-equivalence + RNG-capture holding. **Tests** — 4 new ([tests/unit/engine/slice-325-mace-of-smiting.test.ts](tests/unit/engine/slice-325-mace-of-smiting.test.ts)); full suite green (1951 passed), tsc clean. Coverage snapshot unchanged. Docs: gaps Items.

**Engine + content: crit-gated on-hit riders + Sword of Life Stealing (slice 324)**

Adds the last trigger gate to the on-hit-rider family: a rider can fire only on a critical hit (the 2024 "When you roll a 20 on the attack roll, the target takes an extra ..." shape).

Engine:
- The `onHit` rider schema gains optional `requiresCritical: boolean`. The attack planner's rider filter (which already gates on the slice-318 `condition` predicate) now also drops `requiresCritical` riders when the hit isn't a crit. The two gates compose. No new damage machinery: 2024 crit riders deal *flat* extra damage, which the existing dice field already expresses as a `0d6+N` constant (slice 122), and crit-doubling correctly leaves the flat amount unchanged (RAW doubles dice, not flat bonuses).

Content (canonical user): **Sword of Life Stealing** (a multi-base weapon enchantment, applied via the slice-317 overlay) gains its RAW crit rider — "When you roll a 20 ... the target takes an extra 15 Necrotic damage if it isn't a Construct or an Undead" — as `{ dice: '0d6+15', damageType: 'necrotic', requiresCritical: true, condition: not(Construct or Undead) }`.

Deferred: the "you gain Temporary Hit Points equal to the Necrotic damage taken" self-buff arm (the rider applies to the target; an attacker-side temp-HP arm is a future shape). Mace of Smiting's crit +7/+14 (flat, with a Construct auto-destroy) and Vorpal's crit decapitation (needs a head / too-big / Legendary-Resistance immunity fact before it can reuse the slice-323 `CreatureDestroyed` arm) stay deferred, but the crit-gate they need now exists.

Uncle Bob audit: **Names** — `requiresCritical` says what it gates. **DRY** — reused the existing rider filter, the `0d6+N` flat-damage shape (no new flat-damage field), and the slice-318 `condition` gate; the crit rider rides the same `rollExtraDamageDice` path. **SRP** — one boolean on the schema, one clause on the planner filter. **Magic numbers** — 15 / necrotic / Construct / Undead are RAW-cited on the enchantment. **at-threading** — unchanged (riders roll in the planner, baked into `DamageRolled`). **Mechanical outcomes asserted** — a crit vs a Humanoid emits a necrotic component of exactly +15 flat (0 dice, modifier 15, not doubled); a non-crit hit emits no necrotic; a crit vs a Construct or Undead emits no necrotic (gate). **Tests** — 3 new ([tests/unit/engine/slice-324-crit-rider.test.ts](tests/unit/engine/slice-324-crit-rider.test.ts)); full suite green (1947 passed), tsc clean. Coverage snapshot unchanged (the enchantment stays `itemKind: magic`). Docs: gaps Items.

**Engine + content: instant-destroy primitive + Mace of Disruption destroy-or-Frighten (slice 323)**

Adds the instant-death outcome the on-hit-save rider needed for Mace of Disruption (and the shared primitive future Vorpal-style decapitation will reuse). "Destroyed" / "dies instantly" is a real RAW outcome distinct from damage: the creature dies, bypassing the death-save sequence.

Engine:
- New `CreatureDestroyed` event ([combat.ts](src/schemas/events/combat.ts)) + reducer `applyCreatureDestroyed`: sets `hp.current` to 0 and `deathSaves.failures` to the kill threshold (so anything reading "dead" via death saves sees a dead creature), clears the destroyed creature's concentration (RAW: dying ends Concentration). Wired into [apply.ts](src/engine/apply.ts), the events barrel (5 registration sites), and the transcript formatter.
- The `onHit` rider's `save` arm gains three fields: `hpThreshold` (the save fires only when the target's HP AFTER this hit's damage is at or below it — read from the post-damage state the planner already computes), `destroyOnFail` (emit `CreatureDestroyed` on a failed save, taking precedence over `conditionOnFail`), and `conditionOnSuccess` (a condition applied on a successful save). `conditionOnFail` is now optional; a refine requires the save to have at least one outcome.

Content (canonical user): **Mace of Disruption**'s existing +2d6-radiant-vs-Fiend/Undead rider now also carries the save — RAW "If the target has 25 HP or fewer after taking this damage, DC 15 WIS save or be destroyed; on a success it's Frightened until the end of your next turn." (`hpThreshold: 25, destroyOnFail: true, conditionOnSuccess: 'frightened', sourceIsMagical: true`.) Closes the slice-319 follow-up for this item.

Deferred: the Frightened "until the end of your next turn" duration is consumer-managed (mirror of slices 286/319/321); the Light emanation stays unmodeled. Vorpal-style crit-gated decapitation will reuse `CreatureDestroyed` once the crit-gate rider trigger lands.

Uncle Bob audit: **Names** — `CreatureDestroyed` / `destroyOnFail` / `hpThreshold` / `conditionOnSuccess` say what they are. **DRY** — the reducer reuses the existing massive-damage death representation (failures = kill threshold) and `clearConcentrationEffect`; the planner reuses `applyRiderCondition` for both success and fail conditions; the HP gate reads the already-computed `stateAfterDamage`. **SRP** — event/reducer/planner/schema each in their own layer; the reducer does one thing (mark dead). **Magic numbers** — DC 15 / 25 HP / WIS / Frightened are RAW-cited on the content item; the kill threshold is the existing `DEATH_SAVE_FAILURES_TO_DIE` constant. **at-threading** — `CreatureDestroyed` carries the planner's single resolved `at`; the save's RNG rolls in the planner, apply stays RNG-free. **Mechanical outcomes asserted** — a failed save against a sub-25-HP Undead emits `CreatureDestroyed` and leaves the target dead (hp 0, 3 failures) with replay-equivalence + RNG-capture holding; a successful save Frightens instead; a 200-HP Undead rolls no save (over threshold) but still takes radiant; a Humanoid gets neither save nor radiant (vs-Fiend/Undead gate). **Tests** — 6 new (2 reducer [tests/unit/reducers/creature-destroyed.test.ts](tests/unit/reducers/creature-destroyed.test.ts) + 4 integration [tests/unit/engine/slice-323-destroy-rider.test.ts](tests/unit/engine/slice-323-destroy-rider.test.ts)); full suite green (1944 passed), tsc clean. Coverage snapshot unchanged. Docs: api-overview event list, gaps + slice-319 follow-up closure.

**Magic-equipment + on-hit-rider cohort (slices 315-322)** — per-slice detail archived to [docs/changelog/archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md) (moved in slice 326 when the live CHANGELOG approached the 60 KB single-Read ceiling). Cohort summary:

- **Magic equipment became real equipment** (stages 1-3, slices 315-317): single-base magic armor re-modeled `magic`→`armor` (AC derive grants base AC + `acBonus`; effects project when worn+attuned); single-base magic weapons `magic`→`weapon` (attack planner applies `attackBonus`/`damageBonus`/`onHit` riders); multi-base magic equipment via the **enchantment overlay** (an `itemKind: magic` enchantment referenced by `ItemInstance.enchantmentDefinitionId`, overlaid by the attack / AC / effect-projection / magicality layers). The slice-90 `rollExtraDamageDice` was generalized into the `onHit` per-hit rider.
- **On-hit weapon-rider trigger family** built out: target-gated `condition` predicate (318: Sun Blade vs Undead, Mace of Disruption vs Fiend/Undead); the save-or-condition `save` arm (319: Ghoul's Claw, CON DC 10 or Paralyzed) plus the `rollSaveAgainstDC` DRY refactor unifying all four save-roll sites (320); the unconditional `applyConditionId` (321: Couatl's Bite Poisoned); and a poison natural-weapon content sweep exercising the combined damage+condition rider (322: Wyvern / Ettercap / Merrow).

Net across the cohort: weapons 39 → 52, armor 13 → 22, magic items 275 → 258; ~1908 → 1938 tests; the new `enchantmentDefinitionId` overlay plus the full `onHit` rider vocabulary (`dice` / `condition` / `save` / `applyConditionId`).

## 0.1.0-alpha.9 - 2026-05-19

Promotes the post-alpha.8 cohort (slices 301-314) to a tagged release. `package.json` bumped from `0.1.0-alpha.8` to `0.1.0-alpha.9`; `package-lock.json` regenerated via `npm install --package-lock-only`. Per-slice detail for slices 301-312 is archived to [docs/changelog/archive-slices-301-312.md](docs/changelog/archive-slices-301-312.md) (slice 313 = the archive split; slice 314 = this version bump + tag). Cohort summary:

- **Buff-shape spell sweep (301-302)**: wired True Seeing, Warding Bond (3/4 arms), Heroes' Feast, Wind Walk via existing primitives. Surfaced + tracked the dead-2014-orphan-conditions row and the Warding Bond damage-sharing deferral.
- **pack-integrity audit + dead-orphan cleanup (303-304)**: promoted the slice-298/301 sweeps to [tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts) (duplicate-id, wired/empty name-group, orphan-condition checks); removed the 6 dead 2014-era orphan conditions; added two CLAUDE.md pattern-check norms (promote-sweeps-to-audits; under-walking-references false-positive trap).
- **Magic-item buff sweep (305-312)**: ~22 magic items wired through existing primitives (rings, robes, staves, rods, a medallion, potions, scrolls). Drove the magic-item wired count 64 → 86.
- **`IncreaseAbilityScore` primitive (308)**: new additive-ability-score effect kind (`EFFECT_KINDS` 50 → 51 primitives + `Custom`), distinct from `OverrideAbilityScore`; unblocked the six ability Ioun Stones + Belt of Dwarvenkind's Toughness arm.
- **`itemKind` categorization fixes + permanent guards (309-310)**: a full SRD-type vs pack-`itemKind` cross-reference found + fixed 4 mislabeled Potions and 10 generic Spell Scroll templates (`magic` → `consumable`); each class is now guarded (srd-drift SRD-Potion check; pack-integrity spell-scroll id check). The categorization bug class is closed.

Net across the cohort: 1833 → 1908 tests; magic-item wired count 64 → 86; conditions +1 (`potion-of-invulnerability-active`) / -6 (dead orphans); `EFFECT_KINDS` 50 → 51 primitives.

**Docs: archive slices 301-312 per-slice detail (slice 313)**

The live CHANGELOG was approaching the 60 KB single-Read ceiling (44 KB after slice 312, climbing ~2-3 KB per slice). Per the doc-size discipline playbook, the per-slice detail for the post-alpha.8 cohort (slices 301-312) moved to [docs/changelog/archive-slices-301-312.md](docs/changelog/archive-slices-301-312.md) (31 KB, fits a single Read); the live file keeps the cohort summary above plus this note. The archive pointer-block index below gained the new file. No code or content change; docs only. doc-size audit green.

## 0.1.0-alpha.8 - 2026-05-19

Promotes the slices 282-299 cohort to a tagged release. Eighteen slices on top of alpha.7. `package.json` version bumped from `0.1.0-alpha.7` to `0.1.0-alpha.8`; `package-lock.json` regenerated via `npm install --package-lock-only`. The previous `## Unreleased` heading becomes `## 0.1.0-alpha.8 - 2026-05-19`.

Headline themes for the cohort:

- **Consumable surface near complete.** ConsumeAction union grew through `GrantTempHP` (slice 282), `RemoveConditions` + `RemoveExhaustion` (slice 283), and `ApplyItemBuff` (slice 284). Drives consumables wired count to 42/52 (~81%). Canonical users: Potion of Heroism, Potion of Vitality, Oil of Sharpness, Poison Basic, Antitoxin (slice 291), Perfume (slice 292).
- **UseAction surface extended.** New `Save` variant (slice 286) for Pipes of Haunting's item-fixed-DC save mechanic. New `timeBudget` field on MagicItemSchema (slice 293) for Boots of Speed's cumulative 10-minute-per-long-rest cap, with `ItemTimeBudgetConsumed` event + `minutesElapsed` on UseItemIntent + LR reset hook.
- **Non-walk speed mechanically observable.** Slice 288 added `getEffectiveFlySpeed` / `Swim` / `Climb` / `Burrow` derives over the slice-77 walk algorithm. Slice 290 added the `matchWalkSpeed` op on `ModifySpeed` for "climb speed equal to walk speed" RAW (Cloak of Arachnida, Slippers of Spider Climbing, Spider Climb spell). Slice 289 wired Cloak of the Bat's fly-speed Toggle on top.
- **Three new predicate facts.** Slice 291 added `event.savePreventsCondition` (Antitoxin's "advantage on saves vs Poisoned" gate). Plus the slice-294 consumer-coordinated facts tracking section (catalogs the slice-276 / 278 / 279 LoS / lightLevel slots so future consumers know what to populate).
- **Variant-unroll content sweep.** Slices 295 + 296 carry the slice-229 Belt of Giant Strength pattern forward to the SRD d10 damage-type table: 10 Armor of Resistance variants + 10 Ring of Resistance variants + 10 Potion of Resistance variants + 5 new `protection-*-active` conditions. Slice 297 added the Elvenkind Stealth wires (Boots + Cloak). Slice 298 wired Eyes of Minute Seeing, Headband of Intellect, Necklace of Adaptation, Periapt of Health.
- **AddModifier save/check wildcard primitive.** Slice 299 mirrored slice-266's RollTarget wildcard onto `ModifierTarget`. Stone of Good Luck is the canonical user (12 unrolled entries → 2 wildcard). Five sibling cleanups (Cloak/Ring of Protection, blessed/baned, aura-of-protection-active + Paladin L6 self-effect) refactored in the same slice. 36 entries → 6 effective.
- **Two bugs caught via pattern-check.** (1) Slice 298 found a Stone of Good Luck duplicate pack entry (wired entry's name mismatched SRD canonical, so drift audit silently skipped it). Resolved. (2) Slice 299 surfaced Bless / Bane flat +2 / -2 vs RAW 1d4 deviation (pre-existing approximation documented in rules-truth.test.ts since the original wire). Tracked as deferred row for a future per-roll bonus-die primitive.
- **Doc-size audit shipped.** Slice 285 added [tests/audit/doc-size.test.ts](tests/audit/doc-size.test.ts) asserting every front-door doc + each `docs/changelog/*.md` archive + each `docs/gaps-*.md` catalog stays under the 60 KB single-Read ceiling. Closes the slice-270 / 277 recurring archive cadence.

Net counts: 1728 → 1833 tests across 253 → 268 files (+105 tests, +15 files). Magic-item wired count: 27 → 86 (slices 282-299 added the consumable-surface extensions, variant unrolls, and simple-wire sweep). Coverage snapshot reflects every new wired id. tsc clean; full vitest suite (1833 tests across 268 files) green; doc-size + SRD-drift + RAW-compliance audits all green.

Per-slice detail for slices 282-299 is archived to [docs/changelog/archive-slices-282-299.md](docs/changelog/archive-slices-282-299.md) (moved in slice 303 when the live CHANGELOG crossed the 60 KB single-Read ceiling, mirroring the slice 270 / 277 / 288 archive cadence).

**Release: bump to 0.1.0-alpha.7 (slice 281)**

Promotes the slice 269-280 cohort to a tagged release. `package.json` version bumped from `0.1.0-alpha.6` to `0.1.0-alpha.7`; `package-lock.json` regenerated via `npm install --package-lock-only`. The previous `## Unreleased` heading becomes `## 0.1.0-alpha.7 - 2026-05-19` immediately below.

No code changes. tsc clean; full vitest suite (1728 tests across 253 files) green. Per CLAUDE.md, the bump reflects meaningful surface change (12 slices closing 9 RAW-deviation bugs + a new consumer-coordinated pattern surface + filter-shape pattern-check refinement codified).

The alpha.7 release block keeps the per-slice detail inline. A follow-up archive slice can move the detail under `docs/changelog/archive-slices-269-280.md` once the next slice lands and the live CHANGELOG starts pushing the ceiling again (mirroring the slice 252 / 270 / 277 archive cadence).

## 0.1.0-alpha.7 - 2026-05-19

Cumulative post-alpha.6 release. 31 slices (251-280) shipped since alpha.6 (251-260 archived in slice 270; 261-268 in slice 277; 269-280 archived in slice 288 to [docs/changelog/archive-slices-269-280.md](docs/changelog/archive-slices-269-280.md)).

Headline changes since alpha.6:

- **9 RAW-deviation bugs closed**: Boots of Speed disadvantage on opportunity attacks (slice 269); Blur attacker-sense bypass (slice 271); Dodge benefits disabled by Incapacitated / Speed 0 (slice 272); Invisible perception bypass + missing disadvantage-on-attackers arm (slice 273); Gloves of Swimming Athletics sub-action gate (slice 274); Bracers of Archery +2 damage with longbow / shortbow (slice 275); Frightened breadth + LoS gate (slice 276); Dodge LoS gate per-attacker (slice 278); Cloak of the Bat dim-light Stealth gate (slice 279).
- **First consumer-coordinated bug-fix pattern** (slices 276 / 278 / 279). Engine adds optional input slots (`bearerCanSeeFearSource?`, `targetCanSeeAttacker?`, `lightLevel?`) on `AttackIntent` / `ComputeAbilityCheckInput` that consumers (UI, encounter manager, future VTT) populate when they model the relevant scene state. Default-apply for negative penalties (engine ships current behavior; consumer bypasses with explicit `false`); opt-in for positive benefits (engine ships strict-RAW-narrow; consumer specifies the scene state to receive the benefit).
- **Pattern-check working norm refined** (slices 268, 280). Slice 268 codified the "filter shape determines what a sweep can find" lesson into CLAUDE.md (`narrow filter → narrow sweep → missed adjacent shapes`). Slice 280 documented the negative-penalty vs. positive-benefit semantic in [docs/api-overview.md](docs/api-overview.md) so the choice is explicit for future consumer-coordinated fixes.
- **Predicate-fact namespace expanded** (slices 263 / 271 / 273 / 274 / 275 / 276 / 278 / 279). New `event.sense`, `event.athleticsSubAction`, `event.weaponId`, `attacker.bypassesSightIllusion`, `attacker.canLocateInvisible`, `target.canLocateInvisible`, `bearer.canSeeFearSource`, `bearer.canSeeAttacker`, `bearer.lightLevel`, `bearer.hasIncapacitated`, `bearer.speedZero` facts populated at the appropriate consumer sites.
- **`RollTarget` wildcards on save / check** (slice 266). `{ kind: 'save' }` and `{ kind: 'check' }` without an ability serve as wildcards matching every per-ability query. Mantle of Spell Resistance and poisoned collapsed from 6 per-ability entries each to 1 wildcard entry. Net pack diff: -11 effect entries with byte-identical behavior.
- **`condition` predicate plumbing closed across 4 effect kinds** (slices 258 + 262). `SetAdvantage` (slice 258), `GrantResistance`, `ModifyActionEconomy`, `GrantAdvantageToAttackers` (all three in slice 262) now thread their declared `condition?: Predicate` field through the effect-stack builder. Pre-258 the field was silently dropped.
- **Test count**: 1643 → 1728 across 244 → 253 files. +87 new tests (mostly the slice 269-279 bug-fix cohort: 4-7 cases each).
- **Doc discipline**: two archive slices (270 + 277) restored the single-Read ceiling on front-door docs when they drifted over. Slice 280 added tracking rows for a future CI doc-size check and for consumer-half coverage of engine-half-only RAW fixes.

---

## 0.1.0-alpha.6 - 2026-05-18

Cumulative post-alpha.5 release. 204 vocabulary-expansion slices (47-250) shipped since the alpha.5 line. Slice-by-slice detail for slices 241-250 lives in [docs/changelog/archive-slices-241-250.md](docs/changelog/archive-slices-241-250.md); older Unreleased entries (slices 48-240) were archived to per-cohort files under [docs/changelog/](docs/changelog/) in slice 248 (see the index below).

Headline changes since alpha.5:

- **Package and repo renamed** from `ttrpg-engine-dnd` to `dnd-srd-engine` (slice 247). The previous npm versions (alpha.0 through alpha.5) were unpublished on IP-cleanup grounds; no npm record exists under either name today. Consumers pin via git ref or local path.
- **SRD 5.2.1 pack-presence complete in every category**: 339/340 spells, 235/235 monsters, 275 magic items + 43 consumables, 9/9 species, 16/17 feats, 4/4 backgrounds (plus 17 PHB-2024 feats and 15 PHB-2024 backgrounds kept by policy). Mechanical wiring still grows: spell wiring ~42%, magic-item wiring ~15% (39 effective wires across magic items + consumables).
- **Effect-primitive vocabulary** expanded to 49 wired primitives plus the `Custom` escape hatch. Recent additions include `OverrideAbilityScore`, `GrantAdvantageVsBearersOfMyCondition`, `Regeneration`, `SpawnCreature`, plus the `ConsumeItem` planner and three `ConsumeAction` kinds (`Heal` / `ApplyCondition` / `CastSpell`) covering potions and spell scrolls.
- **SRD canon** now ships as a git submodule at `references/srd-markdown/` (slice 245). Web-source D&D content lookups explicitly forbidden in [CLAUDE.md](CLAUDE.md); enforced by the [SRD drift audit](tests/audit/srd-drift.test.ts) (slice 195) on script-detectable fields across spells, monsters, and magic items.
- **Fresh-agent discovery surface** polished: [AGENTS.md](AGENTS.md) + [.cursorrules](.cursorrules) cross-agent pointers (slice 247), single-Read ceiling enforced across front-door docs (slice 248), `starter-pack-gaps.md` split into per-category catalogs (slice 249), README top-level-dir map (slice 250).
- **Test count**: 1009 (at alpha.5) → 1643 across 244 files. New test layers: SRD drift audit (slice 195), feature-coverage matrix, public-API contract test, stateful combat-sequence property test (60-turn random fights, 6 invariants).

---

*Slice detail for slices 48-391 has been moved out of the live CHANGELOG to per-cohort archives under [docs/changelog/](docs/changelog/) (single-Read fitness; slices 386-391 were archived in slice 392; slices 381-385 were archived in slice 387; slices 376-380 were archived in slice 382; slices 350-351 were archived in slice 353; slices 345-349 in slice 350; slices 329-336 were archived in slice 340; slices 315-322 in slice 326; slices 301-312 in slice 313; slices 269-280 in slice 288; slices 261-268 in slice 277; slices 252-260 in slice 270; the alpha.6 release block of slices 241-250 in slice 252; older slices in slice 248). Each fits in a single Read tool call:*

- *[archive-slices-386-391.md](docs/changelog/archive-slices-386-391.md) (post-alpha.12 cohort part 3: full-RAW conversions of documented deviations - the size gate, Sap/Vex one-shot, the per-instance fixed-DC recurring save + Intimidating Presence repeat save, Absorb Elements slot scaling, and per-instance "ends on damage" for Sleep + Knock Out)*
- *[archive-slices-381-385.md](docs/changelog/archive-slices-381-385.md) (post-alpha.12 cohort part 2: the inert-weapon-masteries fix + emitted-but-undefined audit, a CHANGELOG archive split, Evoker Potent Cantrip, and the Rogue Cunning Strike family (Cunning Strike + Improved + Devious Strikes))*
- *[archive-slices-376-380.md](docs/changelog/archive-slices-376-380.md) (post-alpha.12 cohort part 1: the matchWalkSpeed "equal to your Speed" sweep, the srd-drift class-progression-table extension, and the three slice-377 feature-presence closures (Weapon Mastery on Barbarian/Fighter/Paladin + the Flex resolution, Monk Heightened Focus, Monk Open Hand Technique))*
- *[archive-slices-366-373.md](docs/changelog/archive-slices-366-373.md) (post-alpha.11 cohort part 6: two bug-class arcs - the empty-effect-condition fixes (Hideous Laughter, Bestow Curse ability + inactive arms, Resistance cantrip) and the phantom-field-strip fixes (zero-damage save spells, melee-attack mistagging, cantrip non-scaling, item descriptions + the phantom-field audit))*
- *[archive-slices-361-365.md](docs/changelog/archive-slices-361-365.md) (post-alpha.11 cohort part 5: project-wide doc reconciliation + the CI guards - count-drift, content cross-reference + effect-less-condition, planner-wiring, Custom-handlerId backing)*
- *[archive-slices-354-360.md](docs/changelog/archive-slices-354-360.md) (post-alpha.11 cohort part 4: the subclass-feature wires Land's Aid / Wholeness of Body / Peerless Skill / Empowered Evocation / Aura of Devotion ally-half, plus archive splits 355-356)*
- *[archive-slices-352-353.md](docs/changelog/archive-slices-352-353.md) (post-alpha.11 cohort part 3: Life Domain Preserve Life + a CHANGELOG archive split)*
- *[archive-slices-350-351.md](docs/changelog/archive-slices-350-351.md) (post-alpha.11 cohort part 2: the L14 Tier-B subclass features Intimidating Presence + Dragon Wings)*
- *[archive-slices-345-349.md](docs/changelog/archive-slices-345-349.md) (post-alpha.11 cohort part 1: subclass-doc reconciliation, the Tier-A subclass spell-grant wires (Devotion Spells, Draconic Resilience HP, Evocation Savant), and the first Tier-B subclass features (Hunter Colossus Slayer, Fiend Dark One's Blessing))*
- *[archive-slices-337-343.md](docs/changelog/archive-slices-337-343.md) (0.1.0-alpha.11 cohort: spell-gaps catalog reconciliation + count audit, the hp-threshold spell mechanic with Power Word Kill + Power Word Stun, the multi-damage save extension with Flame Strike, the planDimensionDoor teleport planner, and Enthrall)*
- *[archive-slices-329-336.md](docs/changelog/archive-slices-329-336.md) (post-alpha.10 cohort part 1: SRD-compliance docs accuracy sweep, the AddBonusDie primitive making Bless/Bane fully RAW, the Monk's Focus bonus-action trio that closed the last deferred main-class feature, and the deferred-primitives-backlog doc split)*
- *[archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md) (post-alpha.9 cohort: magic-equipment modeling stages 1-3 + the on-hit weapon-rider trigger family — target-gate, save, unconditional condition, plus the poison natural-weapon sweep)*
- *[archive-slices-301-312.md](docs/changelog/archive-slices-301-312.md) (post-alpha.8 cohort: buff-shape spell sweep, pack-integrity audit + orphan cleanup, magic-item buff sweep ~22 items, IncreaseAbilityScore primitive, itemKind categorization fixes + guards)*
- *[archive-slices-282-299.md](docs/changelog/archive-slices-282-299.md) (alpha.8 release block: consumable + UseAction surface, non-walk speed, variant unrolls, AddModifier wildcard)*
- *[archive-slices-269-280.md](docs/changelog/archive-slices-269-280.md) (alpha.7 release block: bug-fix cohort + consumer-coordinated pattern + docs hygiene)*
- *[archive-slices-261-268.md](docs/changelog/archive-slices-261-268.md) (pattern-check chain: norm codified, RAW-deviation sweeps, filter-shape refinement)*
- *[archive-slices-252-260.md](docs/changelog/archive-slices-252-260.md) (post-alpha.6 polish + audit-gap-fix trio + closure-annotation convention)*
- *[archive-slices-241-250.md](docs/changelog/archive-slices-241-250.md) (alpha.6 release block, slices 241-250)*
- *[archive-slices-235-240.md](docs/changelog/archive-slices-235-240.md)*
- *[archive-slices-217-234.md](docs/changelog/archive-slices-217-234.md)*
- *[archive-slices-201-216.md](docs/changelog/archive-slices-201-216.md)*
- *[archive-slices-196-200.md](docs/changelog/archive-slices-196-200.md) (also covers monster batches 5.x + subclass batches 1.x)*
- *[archive-slices-186-195.md](docs/changelog/archive-slices-186-195.md)*
- *[archive-slices-177-185.md](docs/changelog/archive-slices-177-185.md)*
- *[archive-monsters-batch-4.md](docs/changelog/archive-monsters-batch-4.md) (monsters batch 4.x)*
- *[archive-items-batch-4.md](docs/changelog/archive-items-batch-4.md) (items batch 4.x)*
- *[archive-slices-172-176.md](docs/changelog/archive-slices-172-176.md)*
- *[archive-content-batches-1.md](docs/changelog/archive-content-batches-1.md) (monsters batch 1.x + items batch 1.x)*
- *[archive-rollup-narrative-A.md](docs/changelog/archive-rollup-narrative-A.md) (slices 48-171 rollup, first half)*
- *[archive-rollup-narrative-B.md](docs/changelog/archive-rollup-narrative-B.md) (slices 48-150 rollup, second half + tail of Unreleased)*

*Released versions (alpha.0 through alpha.5) of the pre-rename package were moved to [docs/changelog/released-versions.md](docs/changelog/released-versions.md).*


## Released versions

Released versions (alpha.0 through alpha.5) of the pre-rename `ttrpg-engine-dnd` package live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). All were unpublished from npm in May 2026 on IP-cleanup grounds; the renamed `dnd-srd-engine` package has not yet cut a fresh release.
