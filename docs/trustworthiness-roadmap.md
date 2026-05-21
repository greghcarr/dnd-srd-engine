# Trustworthiness Roadmap

What it takes for `dnd-srd-engine` to be safely usable for an unsupervised tabletop session against 5.5e (2024) rules. This is a planning doc, not a marketing one — pessimistic about current state, optimistic only about where the work is going.

Last calibrated: 2026-05-17, post-slice-196.

---

## What "trustworthy" means here

A working definition, in three sentences. **The engine is trustworthy** when (a) every rule it claims to enforce, it actually enforces; (b) every content entry in the shipped pack has matching engine behavior; (c) a DM who knows 5e/5.5e can run a session without watching the engine for rules cheats. (a) and (b) are substantially true today for low-level play; (c) requires more property-test fuzzing and adversarial probing than the current 48-probe audit affords.

Non-goals: homebrew system support, optional variant rules (sanity / mass combat are inert unless explicitly toggled, and stay that way), third-party content packs.

---

## Current state honest summary

> **Snapshot scope: as of slice ~196 (2026-05-17).** The content counts in this section are a point-in-time calibration and are intentionally not updated every slice. For live current-state numbers (the pack now ships 351 spells / 194 wired, 253 monsters, 515 items / 258 magic, 121 conditions, etc.) see [status.md](status.md) and [starter-pack-gaps.md](starter-pack-gaps.md). The qualitative assessment below still holds; only the magnitudes have grown.

- **48-probe RAW-compliance audit passes in full** ([tests/audit/raw-compliance.test.ts](../tests/audit/raw-compliance.test.ts)). 0 🔴 / 0 🟡 open. Two ⚪ items remain (sanity, mass-combat variant rules; their flags toggle but the rule interpretation isn't wired).
- **15-check SRD drift audit harness ships** ([tests/audit/srd-drift.test.ts](../tests/audit/srd-drift.test.ts), slice 195). Compares every pack spell, monster, and magic item against the SRD 5.2.1 markdown clone on the script-detectable fields (schools, levels, components, classes, casting time / range / duration, concentration / ritual flags, halfOnSuccess, attackKind, damage dice; monster AC/HP/CR/abilities; magic-item rarity + attunement). Zero drift today. Slices 177-196 used the same comparison logic ad-hoc to ship ~310 drift fixes before formalizing it as a checked-in test.
- **The audit's scope is 48 specific rules out of hundreds.** It's a floor, not a ceiling. Adversarial probing keeps finding edge cases that didn't make the initial list (Frightened source-tracking, Charmed attack-blocking, exhaustion progression beyond level 1, multiclass spell-slot edge cases, etc.). Each new category surfaces work the audit didn't anticipate.
- **Engine vocabulary is still expanding.** Each remaining engine slice adds a small primitive (~50–200 LoC) that closes one named category from [docs/starter-pack-gaps.md](starter-pack-gaps.md). The architectural skeleton is locked; the long tail of "X mechanic for Y spell-cohort" is still being walked.
- **Content slice is substantial but uneven.** 336 spells (324 SRD 5.2.1 + 12 wired-non-SRD; ~141 mechanically wired), 181 monsters across all 14 creature types (CR 0-24, both dragon ladders fully closed), 330 items including 122 magic items (full SRD 5.2.1 adventuring-gear / tools / consumables surface closed), 12 classes with full L1-L20 tables, 19 backgrounds (4 SRD + 15 PHB 2024 extras), 33 feats (16 SRD + 17 PHB 2024 extras), 97 conditions (15 RAW + 82 rider variants), 12 subclasses (L3 only). The big remaining gaps: the L7+ subclass features (41 SRD-listed), ~189 missing monster statblocks, the long tail of DMG magic items beyond the SRD subset.

---

## Tier 1 — Close every documented RAW gap

**Goal:** the 48-probe audit runs all green, no 🔴 / 🟡 in the engine-gaps table.

**Status:** **DONE.** All 48 probes pass. The historical sweep landed across the alpha.4 → alpha.5 work. Engine gaps reduced from 17 (alpha.3 calibration) to 0 🔴 + 0 🟡 + 2 ⚪.

The two remaining ⚪ items (sanity and mass-combat variant rules) are deferred by design — their flags toggle but the rule interpretation needs its own slice each (sanity needs a 7th ability score path through character creation; mass combat needs a Squad entity + morale ladder + resolution planners). Neither blocks normal play; both stay opt-in.

---

## Tier 2 — Extend the audit until it actually probes RAW

**Goal:** the audit goes from "17 curated probes" to categorical coverage of the rules an engine of this scope claims to enforce.

**Status:** **PARTIAL.** The audit grew from 17 to 48 probes. Categories closed since the original framing:

- ✓ Frightened can't willingly move closer to source (source-tracking shipped slice-93 era).
- ✓ Charmed can't attack the charmer (same source-tracking thread).
- ✓ Two-weapon fighting light-only enforcement.
- ✓ Heavy-weapon Small disadvantage.
- ✓ Loading property on ranged weapons.
- ✓ Difficult-terrain double cost via Bresenham per-cell summation in `planMove`.
- ✓ Massive damage threshold uses `hp.max + hp.maxBonus`.
- ✓ Concentration auto-clears on drop to 0 HP.
- ✓ Reaction cap enforcement.
- ✓ Stand-from-prone costs half speed.
- ✓ Ranged-in-melee disadvantage.
- ✓ Move-into-occupied-space rejection (and Misty Step occupancy check).
- ✓ Multiclass slot math (full / half / pact tables, exhaustive boundary tests in [tests/boundaries/](../tests/boundaries/)).
- ✓ Attacker-side `advantageFor('attack')` actually consulted (slice 97 — Blinded / Poisoned / Frightened / Prone / Restrained / Invisible all now affect the d20).

**Still open** (categories named in earlier calibrations that haven't gained a dedicated probe):

| Category | Probe shape | Status |
|---|---|---|
| Cover bonuses | Position attacker with target behind half / three-quarters cover; expect +2 / +5 AC | Schema supports `coverACBonus`; consumer-driven today, no automatic encounter-position-based detection |
| Exhaustion progression effects beyond level 1 | Apply exhaustion 1–6 sequentially; verify d20-test penalty and HP-max halve at level 4 | The 2024 exhaustion math is unique; engine has partial coverage |
| Encumbrance enforcement | Load past carry capacity; verify speed-reduced flag | `computeEncumbrance` exists; planner doesn't gate moves on it |
| Sneak Attack eligibility under no-advantage AND no-adjacent-ally | Roll Sneak Attack damage without either qualifier; expect rejection | `attackerHasAllyAdjacentToTarget` flag wired; the eligibility predicate should be exercised |
| Two-handed conflicts with shield | Equip a versatile two-handed weapon while shield equipped; verify hand state | Slice 9b's `planEquip` rejects illegal combinations; needs a probe |

**Effort tier roughly:** small per probe (~10–15 lines each plus shared setup). Expect 0–30% to expose new bugs based on the recent hit rate.

---

## Tier 3 — Fill the content stubs

**Goal:** the class-features matrix has no stubs at L1–L20.

**Status:** **SUBSTANTIALLY DONE through L7.** The class-features matrix is fully wired through L7 across all 12 classes. The 14 named alpha.5-era class-feature stubs all shipped wires; the 3 remaining class-feature placeholders (Feral Instinct, Deft Explorer, Wild Companion) all wired. L8–L20 features ship at every grant level with effects wired where the primitive vocabulary covers them, narrative-only otherwise.

**Subclass features:** 12 subclasses ship (one canonical per class, L3 only). Most L3 features are wired; a small remainder of subclass-feature stubs remains (Circle of the Land, Evoker Sculpt Spells, Fiend Patron Dark One's Blessing, Hunter Lore + Prey, Thief Fast Hands, Warrior of the Open Hand Technique). L7 / L10 / L14 subclass features and the other 3–4 subclasses per class are still authoring work.

**Partial wires from earlier sweeps** (the narrowly-scoped Tier 3 closures that need follow-up):

- `AddModifier { value: Formula }` — was unused at the closure date. **Now actually evaluated** when a FormulaContext flows through (slice 64). Sacred Weapon's static `+3` could now read the caster's CHA mod at apply time; the content row hasn't been updated to use the Formula form yet.
- Predicate DSL extensions ("ranged attack" / "while wearing armor" / "one-handed weapon, no off-hand"). Still open. Unblocks proper conditional fighting-style effects (Archery, Defense, Dueling currently apply unconditionally). Also unblocks Armor of Agathys's "while temp HP > 0" retaliation gate.
- `planRage` — full Rage mechanic (resistance, attack bonus, exhaustion-at-end). Still open. Frenzy's bonus-action attack grant and end-of-rage exhaustion remain consumer-driven.
- Per-Metamagic-option spell modification in `planCastSpell` (Twinned, Distant, Quickened, Empowered, ...). Still open. `engine.plan.metamagic` spends the SP cost; the actual spell-shape modification is consumer-driven.
- Familiar as a first-class entity. Still open.
- `OfferChoice` at character-creation L1 (only fires on level advancement). Still open.
- The 3 unwired Fighting Styles (Great Weapon Fighting, Protection, Two-Weapon Fighting). Still open.
- Auto-expiry for trigger-applied conditions (slice-98 ApplyCondition durations are declarative metadata; the consumer removes the condition). Still open.

---

## Tier 4 — Replace the starter pack with the actual SRD

**Goal:** ship `dnd-srd-engine-srd-2024` (Slice 31 from the original Phase D plan, never done) as a separate package that supersedes the starter pack.

**Status:** **PARTIALLY ACHIEVED VIA THE STARTER PACK.** The split between "starter pack ships in the engine package" and "separate SRD package" remains the same as alpha.5, but the starter pack itself has filled out significantly:

| Category | alpha.4 | Now |
|---|---|---|
| Classes (L1–L20 features) | L1–L5 only | All 12 classes at L1–L20 |
| Subclasses | 0 | 12 (L3 only) |
| Spells (in pack) | ~33 | 399 (every PHB 2024) |
| Spells (mechanically wired) | ~26 | ~152 |
| Backgrounds | 8 | 16 / 16 PHB 2024 ✓ |
| Conditions | 15 | 25 (15 RAW + 10 rider) |

**Still missing**: most subclasses (12 of ~50), L7 / L10 / L14 subclass features, the DMG magic-item catalog (~9 of hundreds), the bulk of the MM bestiary (~6 of ~370 statblocks), 3 species (Aasimar / Goliath / Orc), many general feats.

**This is mostly content authoring, not engine work.** The schemas and primitive vocabulary support every shipped category; the remaining work is JSON.

**Effort:** the largest tier by raw volume. Each MM statblock or PHB subclass is one or two `it()`s of authoring + light validation. The 250-ish schema-only spells each need either a primitive shipped (per [docs/starter-pack-gaps.md](starter-pack-gaps.md)) or a confirmation that the existing shape already covers them.

---

## Minimum-viable-trust subset

For a kitchen-table game with a DM watching (the dndbnb use case), the minimum is:

- **Tier 1 done.** ✓
- **Tier 2 categories that affect basic combat:** ranged-in-melee disadvantage ✓, sneak attack eligibility ✓, two-weapon fighting eligibility ✓, multiattack target legality ✓, cover bonuses (open), difficult terrain ✓.
- **Tier 3 features actually in use by the playing party.** If nobody is playing a Wizard School of Evocation, Sculpt Spells can stay narrative.
- **Tier 4 not required.** Bring-your-own-content is fine; a DM authoring custom content is a legitimate path.

By that standard, **the engine is at the minimum-viable-trust threshold for L1–L7 play.** Higher-level play exercises the L8–L20 feature wirings (most of which ship narrative-only at the content layer), the bulk of the spell catalog (~250 schema-only), and a wider monster bestiary. Those are the dimensions to advance for higher-level trust.

---

## Risks and caveats

- **Audit blind spots.** The audit catches what its 48 `it()`s probe. Categories nobody thinks to write a probe for stay broken silently. The audit is a floor, not a ceiling.
- **Per-fix scope creep.** Slice cadence keeps this manageable: each slice ships one primitive + one canonical content user, then commits. Bundling unrelated cleanup is the canonical anti-pattern.
- **Demo / engine seam.** Some engine slices change the planner contract (the slice-9b OA opportunities surface, the slice-91 reaction-window pattern). Web demo + any existing consumer needs matching changes. Coordinate the seam break with an explicit CHANGELOG note.
- **2024 rule churn.** The 2024 rules are still bedding in (third-party errata, ruling clarifications). What looks like a RAW violation today may be a clarification target tomorrow. Pin sources where possible (PHB page / errata version).
- **Primitive drift.** A primitive shipped without a real-content user tends to drift from RAW. The current cadence (primitive + canonical user in the same slice) keeps drift small but doesn't eliminate it. When a second spell of the same shape arrives, the primitive sometimes needs a small refinement; that's a follow-up slice, not bundled work.

---

## How to use this doc

If you're prioritizing a session of work:

1. **Look at [docs/starter-pack-gaps.md](starter-pack-gaps.md)'s future-engine-slices table.** Pick a primitive by impact (count of schema-only spells it unblocks). The recent cadence (slices 88–100) walked this table.
2. **Implement primitive + canonical content user + tests** following the patterns from recent slices. Walk the gaps-doc rows from `future` to `shipped` and from `schema-only` to `wired`.
3. **For audit gaps** (Tier 2 open categories above): pick a category, write a probe in [tests/audit/raw-compliance.test.ts](../tests/audit/raw-compliance.test.ts), fix anything it surfaces, lift the row from this doc.
4. **For content sweeps** (Tier 4): pick a cohort of schema-only spells that share an already-shipped primitive shape, walk them to wired in one content-only slice (no engine change).

When in doubt, run `git log --oneline | head -20` and copy the pattern of the most recent slice in the relevant category.
