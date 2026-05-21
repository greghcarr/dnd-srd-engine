# CHANGELOG archive: slices 381-385 (post-alpha.12 cohort, part 2)

Per-slice detail for slices 381-385, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 387 to keep it under the 60 KB single-Read ceiling. Cohort: the inert-weapon-masteries bug-class fix (381 Sap/Vex/Slow defined + the emitted-but-undefined audit), a CHANGELOG archive split (382), Evoker Potent Cantrip (383), and the Rogue Cunning Strike family (384 Cunning Strike + Improved, 385 Devious Strikes). See also [archive-slices-376-380.md](archive-slices-376-380.md).

---

**Content (slice 385): Rogue Devious Strikes (L14) - Obscure + Knock Out**

Extended the slice-384 Cunning Strike dice-trade with two of the three Devious Strikes (Rogue L14) options. Both are option-table + level-gate additions on the existing seam (no new engine plumbing):

- **Obscure** (Cost 3d6): DEX save vs the rogue's DC or Blinded until the end of its next turn.
- **Knock Out** (Cost 6d6): CON save vs the rogue's DC or Unconscious for 1 minute.

`cunning-strike.ts` gains the two `SPECS` entries (with a `devious` flag and per-effect `expiryRounds`, generalizing the previously poison-specific expiry stamping), and a `cunningStrikeMinLevel` helper. The attack planner now rejects a Devious option below Rogue L14 (`does not have Devious Strikes`); the existing dice-sufficiency check naturally caps two-effect combinations (e.g. Knock Out's 6d6 + anything > 7d6 at L14 throws). The L14 `devious-strikes` feature is wired (`Custom { handlerId: 'cunning-strike' }`).

**Daze (Cost 2d6) is deferred.** "On its next turn it can do only one of move / action / Bonus Action" needs a partial-action-economy primitive the engine doesn't model; a `dazed` marker would be mechanically inert (the exact anti-pattern slice 381 fixed), so it's tracked rather than faked. Documented deviations on Knock Out (as with Poison): the end-of-turn repeat save and "until it takes any damage" early end aren't modeled (base Unconscious carries neither, and the condition-applied event can't add them).

Uncle Bob audit (content sweep): **Names** `cunningStrikeMinLevel` / `devious` / `expiryRounds` are intention-revealing. **DRY** the expiry stamping generalized from the poison-specific branch to a per-spec `expiryRounds`; Obscure / Knock Out reuse the existing save + condition path. **SRP** the option table owns the vocabulary; the planner owns the level gate. **Magic numbers** the 3d6 / 6d6 costs, the L14 gate, and the 1-minute / end-of-next-turn durations cite SRD. **Mechanical outcomes asserted** five cases: Obscure DEX-save + Blinded, Knock Out CON-save + Unconscious, Knock Out forgoes 6d6 (non-crit Sneak Attack <= 1d6 at L14), the L14 gate throws below level, and two Obscures pair under Improved Cunning Strike. No engine change. No em/en dashes. `tsc --noEmit` clean; full suite green.

**Engine+content (slice 384): Rogue Cunning Strike + Improved Cunning Strike**

Wired the Rogue's Cunning Strike (L5) and Improved Cunning Strike (L11), the highest-payoff item left on the subclass/class-feature menu (it unblocks the dice-trade family). RAW: when the rogue deals Sneak Attack damage, they may forgo Sneak Attack dice ("remove the die before rolling") to add an effect, each effect costing a number of d6.

The primitive is a seam in the Sneak Attack trigger:

- New `cunningStrikeEligible` flag on the `AddDamage` trigger action marks the Sneak Attack rider as the one Cunning Strike trades from. The pack's 9 Sneak Attack rows (L3-L19) carry it.
- `AttackIntent.cunningStrike` (and `ResolveAttackInput.cunningStrike`) carries the chosen effects. The attack planner validates at plan time: the attacker has the feature (Rogue L5+), the effect count is within the level cap (1 at L5-10, 2 at L11+ via Improved Cunning Strike), and enough Sneak Attack dice exist to forgo (read from the `cunningStrikeEligible` rider, not a hardcoded formula).
- The trigger dispatcher forgoes the chosen effects' combined die cost from the Sneak Attack `AddDamage` before rolling (a crit then doubles what remains), and emits the effects right after the damage, only when the Sneak Attack trigger actually fires (so an unqualifying attack resolves nothing).

The three L5 options ship in the new [cunning-strike.ts](../../src/engine/plan/cunning-strike.ts): **Poison** (CON save vs 8 + DEX + PB or Poisoned, 1 minute), **Trip** (DEX save or Prone), **Withdraw** (the rogue Disengages). Both features wire as `Custom { handlerId: 'cunning-strike' }` (Improved is the same mechanic with the cap gated on level). **Devious Strikes (L14: Daze / Knock Out / Obscure) is deferred** - the dice-trade machinery now exists, so those are mostly option-table additions plus a Daze condition and a repeat-save shape.

RAW deviations (documented in [docs/starter-pack-gaps.md](../starter-pack-gaps.md) / gaps-class-features.md): Poison's end-of-turn repeat save (base Poisoned carries none), Trip's "Large or smaller" size gate, Withdraw's half-Speed cap (the engine's movement is position-free; Disengage is the closest primitive), and the Poison "Poisoner's Kit on your person" requirement are not modeled.

Uncle Bob audit (engine slice): **Names** `cunningStrikeEligible` / `cunningStrikeForgoDice` / `cunningStrikeSaveDC` / `buildCunningStrikeEffects` / `assertCunningStrikeUsable` / `sneakAttackDiceCount` are intention-revealing. **DRY** the save rolls reuse `rollSaveAgainstDC`; the dice forgo flows through the existing `rollAddDamage` (one new param) rather than a parallel path; the option metadata lives in one `SPECS` table. **SRP** the planner validates, the dispatcher forgoes + emits, the cunning-strike module owns the effect/cost vocabulary. **Magic numbers** the L5 / L11 gates, the 1d6 costs, and the DC formula cite SRD. **at-threading** the dispatcher's single `at` flows to every emitted effect event. **Mechanical outcomes asserted** eight cases: the forgo shrinks the Sneak Attack (non-crit max 2d6 with Poison vs 3d6 without), Poison CON-save + Poisoned, Trip DEX-save + Prone, Withdraw Disengages, Improved allows two effects, and three validation throws (below L5, two effects at L5, non-rogue). **Tests** each pins an arm the stub couldn't do. No em/en dashes. `tsc --noEmit` clean; full suite green.

**Engine+content (slice 383): Evoker L3 Potent Cantrip**

Wired the Evoker's L3 Potent Cantrip (it wasn't even a stub row in the pack). RAW: "When you cast a cantrip at a creature and you miss with the attack roll or the target succeeds on a saving throw against the cantrip, the target takes half the cantrip's damage (if any) but suffers no additional effect."

New `GrantPotentCantrip` effect kind (a passive marker, mirroring `GrantEvasion`): the builder folds it to a `hasPotentCantrip()` flag on the effect stack, and cast-spell reads it from the **caster's** stack in two places:

- **Attack cantrips**: the miss path previously did `if (!hit) continue` (no damage). Now, if the caster has Potent Cantrip and the spell is a cantrip, a miss still rolls the damage and applies half (no crit, no rider). A plain caster's miss still deals nothing.
- **Save cantrips**: the save-success outcome treats the cantrip as halves-on-success even when the mechanic doesn't declare `halfOnSuccess`, so a successful save takes half instead of zero (Sacred Flame, Toll the Dead, etc.). The Evasion interaction folds through the same `halvesOnSuccess`.

Wired the Evoker L3 `potent-cantrip` feature with `GrantPotentCantrip`. `EFFECT_KINDS` goes 52 -> 53 (52 primitives + `Custom`); the guarded count docs (authoring-content-packs.md, concepts.md) and the prose citations (api-overview.md, status.md, CLAUDE.md) were updated in the same slice.

Uncle Bob audit (engine slice): **Names** `GrantPotentCantrip` / `hasPotentCantrip` / `markPotentCantrip` / `casterHasPotentCantrip` / `potentHalfOnMiss` / `halvesOnSuccess` read as what they do and follow the `GrantEvasion` / `hasEvasion` precedent. **DRY** the half-damage logic reuses the existing `halveDamage` helper; the save arm folds Potent Cantrip into the existing `halvesOnSuccess` branch rather than duplicating the outcome ladder. **SRP** the marker only flags the caster; cast-spell owns the half-damage decision in each resolution path. **Magic numbers** none (half via `halveDamage`; the L3 gate is the feature placement). **at-threading** unchanged (the existing `at` flows to the miss-damage events). **Mechanical outcomes asserted** two new cases: an Evoker deals exactly `floor(rolled/2)` on a missed Fire Bolt while a plain wizard deals none; an Evoker deals half on a successful Sacred Flame save while a plain wizard deals none. **Tests** each pins an arm against a non-Evoker control. No em/en dashes. `tsc --noEmit` clean; full suite green.

**Docs (slice 382): archive CHANGELOG slices 376-380 (single-Read ceiling)**

The live CHANGELOG had reached exactly 60,000 bytes after slice 381, right at the doc-size single-Read ceiling. Per the doc-size discipline playbook, moved the per-slice detail for the post-alpha.12 cohort's first five slices (376-380) to [docs/changelog/archive-slices-376-380.md](../changelog/archive-slices-376-380.md) (14 KB, fits a single Read), leaving slice 381 inline plus the pointer below. Root-relative links in the moved entries were rewritten for the archive's `docs/changelog/` location, and the archive-index block gained the new file. No code or content change; docs only. doc-size audit green; live CHANGELOG back to ~46 KB.

**Engine+content (slice 381): Sap / Vex / Slow weapon masteries were silently inert**

Investigation (prompted by the slice-380 note that the weapon-mastery conditions weren't defined) confirmed a real bug: `planWeaponMastery` emitted `ConditionApplied` for `sapped`, `vexed-by`, and `slowed-10ft`, but **none of the three were defined in the pack**. `collectConditionEffects` (effect-stack.ts) only applies a condition's effects `if (condition)` resolves, and nothing read these by id, so three of the eight weapon masteries did nothing: Sap didn't impose Disadvantage, Slow didn't reduce Speed, Vex didn't grant Advantage. The marker was stored (so transcripts and the s23 golden's marker-only assertions looked fine), but no mechanic fired. starter-pack-gaps.md additionally claimed these conditions "ship to back rider effects" - false.

Fix (RAW deviations documented):

- **Slow** (`slowed-10ft`): defined with `ModifySpeed { walk, -10 }` + `autoExpiry { afterRounds: 1, turnStart }` (the `power-word-speed-zero-active` shape). Fully correct; the speed derive folds it in.
- **Sap** (`sapped`): defined with `SetAdvantage { attack, disadvantage }` + autoExpiry. The attack resolver's attacker-self advantage folds it in. Deviation: RAW is the target's *next* attack only; the engine imposes it until the start of the attacker's next turn (with Extra Attack this over-applies).
- **Vex**: RAW grants the **attacker** Advantage on their next attack against the struck creature, so the condition was restructured to ride the attacker (`vexing-active`, `sourceCharacterId` = target) with `SetAdvantageVsSource { attack, advantage }` - the mirror of Bestow Curse's `cursed-attacks-active`. The attack resolver's `advantageVsSource('attack', targetId)` grants advantage only when the vexer next attacks that target. Same one-shot -> persistent deviation as Sap. (The old target-side `vexed-by` id is gone.)

`planWeaponMastery` now stamps round-based expiry from each condition's `autoExpiry` (mirroring cast-spell). New condition count: 130 (was 127); rider 115.

**Permanent audit (the real protection):** added a pack-integrity check that scans engine source for `conditionId: '<literal>'` emissions and asserts each is a defined pack condition (the mirror of the existing orphan-condition reachability check, with a stale-allowlist self-check). This would have caught the bug at commit time; it's the "promote a repeatable sweep to an audit" norm applied to the inverse direction.

**Tests:** the s23 golden's Vex case now asserts the attacker carries `vexing-active` keyed to the target (not a target-side marker); a new [slice-381 unit test](../../tests/unit/engine/slice-381-mastery-conditions.test.ts) pins the three observable mechanics against the starter pack (Slow reduces effective speed by 10; a Sapped creature rolls attacks with disadvantage / two d20s; a Vexer has advantage vs the vexed target only, `none` vs a bystander).

Uncle Bob audit (engine slice): **Names** `masteryExpiryFields` / `vexing-active` are intention-revealing. **DRY** the expiry stamper mirrors cast-spell's inline logic, now a named helper at its second call site. **SRP** each switch arm builds one mastery's events; the helper owns expiry. **Magic numbers** the -10 speed, the autoExpiry afterRounds, and the DCs cite SRD. **at-threading** the planner's single `at` flows to every emitted event. **Mechanical outcomes asserted** the three masteries' real effects (speed / attack-disadvantage / attack-advantage), the Vex keying, and the new emitted-but-undefined guard. **Tests** each pins a mastery that previously did nothing. No em/en dashes. `tsc --noEmit` clean; full suite green.
