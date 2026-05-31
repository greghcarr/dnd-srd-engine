# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content (slice 529): at-will spellcasting sweep — 8 monsters wired, 5 missing Magic Resistance traits closed**

Follow-up to slice 527. Authors the at-will arm of every per-spell-envelope monster in the pack per SRD 5.2.1 (8 monsters, 16 at-will GrantSpell traits). Folds in 5 missing Magic Resistance traits surfaced during the SRD audit (Unicorn, Dryad, Deva, Planetar, Solar — all carry MR per RAW; pack was silently missing).

| Monster | Ability | At-will spells |
|---|---|---|
| Cloud Giant | CHA | Detect Magic, Fog Cloud, Light |
| Storm Giant | WIS | Detect Magic, Light |
| Couatl | WIS | Detect Evil and Good, Detect Magic, Detect Thoughts |
| Unicorn | CHA | Detect Evil and Good, Druidcraft |
| Deva | CHA | Detect Evil and Good |
| Planetar | CHA | Detect Evil and Good |
| Solar | CHA | Detect Evil and Good |
| Dryad | CHA | Animal Friendship, Charm Monster, Druidcraft |

**SRD 2024 reconciliation surprises** (the deferred-mechanics doc was 2014-era):
- Planetar + Solar's "Invisibility self-only at-will" is actually in Divine Aid (2/Day) — not at-will. Stays deferred.
- Couatl + Deva's "Shapechange at-will" is the Shape-Shift action (deferred).
- **Couatl does NOT have Magic Resistance in SRD 2024** (pre-2024 had it; explicit negative test).

**Doc-count updates:** Magic Resistance cohort 36 -> 41 in [docs/status.md](docs/status.md).

**Tests** ([tests/unit/engine/slice-529-at-will-spellcasting-sweep.test.ts](tests/unit/engine/slice-529-at-will-spellcasting-sweep.test.ts), 23 cases): trait shape + effect-stack projection per (monster, spell); 5 Magic Resistance additions; Couatl-no-MR negative; Cloud Giant end-to-end cast smoke (no SpellSlotConsumed).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses slice 527's pathway. No new identifiers.

**Pattern-check:** closes the at-will half of Innate Spellcasting in one batch. Per-day half remains the only real primitive gap on monster innate spellcasting. The 5 silently-missing-MR fixes illustrate the value of cross-checking SRD RAW against pack content during any sweep; three (Deva, Planetar, Solar) had been missing since the slice-1.15 angel cohort.

---

**Docs (slice 528): reflect slice 527's at-will spellcasting discovery in the deferred-mechanics catalog**

Three entries updated in [docs/gaps-monsters-deferred-mechanics.md](docs/gaps-monsters-deferred-mechanics.md):

1. **At-will Invisibility (Imp/Quasit/Sprite):** struck through + marked "Closed by slice 527" with the composition explanation (slice-260 annotation convention).
2. **Innate Spellcasting (per-spell envelope):** split into "at-will arm (shipped per slice 527, one-line content per monster)" and "per-day arm (still deferred; needs per-spell usage counter + per-day reset + new trait shape)." Couatl's 13-entry list annotated 3 at-will + 10 per-day.
3. **Permanent magical Invisibility (Invisible Stalker):** corrected the stale "both routes need a pathway, currently absent" cross-reference; reframed to note the at-will route is closed (slice 527) and the always-on route is a distinct remaining gap (two design alternatives proposed).

No content / engine changes. Pure doc correction.

**Pattern-check:** slice 527's discovery is an instance of a broader pattern — the engine has accreted enough primitives that some "deferred" entries are stale claims, not real gaps. A future audit-promotion could CI-guard the deferred-mechanics doc with "verified deferred at slice N" timestamps; not in scope here, tracked.

---

**Content (slice 527): at-will Invisibility for Imp / Quasit / Sprite via monster-trait GrantSpell**

Wires the Imp + Quasit + Sprite Invisibility actions per RAW. **Zero engine code** — the slice is pure-content. Discovered while scoping the next monster primitive: three independent pre-existing pieces compose to make at-will monster spellcasting work today, without any new schema or planner.

RAW (each, paraphrased): "The {monster} casts Invisibility on itself, requiring no spell components and using Charisma as the spellcasting ability."

**The discovery:** what looked like a substantial new primitive ("monster-action-self-cast-condition") was already supported by composing three slices that landed years apart:

1. **Slice 444-ish**: monster statblock `traits[]` array folds verbatim into the bearer's effect stack ([src/derive/effect-stack.ts](src/derive/effect-stack.ts) `collectMonsterEffects` line 223).
2. **Slice 212**: `characterKnowsSpell` consults the effect stack via `effectiveSpellList`, so GrantSpell entries projected from any source (subclass, item, **monster trait**) make the spell castable.
3. **Slice 513**: the cast-spell `noSlotCost` derivation detects `preparation: 'at-will'` on granted spells and skips SpellSlotConsumed emission entirely.

Together, an at-will GrantSpell trait on a monster makes the monster cast that spell for free. No new pathway needed.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Imp `traits` gain `{ kind: 'GrantSpell', spellId: 'invisibility', preparation: 'at-will', spellcastingAbility: 'CHA' }`.
- Quasit `traits` gain the same.
- Sprite `traits` (previously `[]`) become `[{ kind: 'GrantSpell', spellId: 'invisibility', ...}]`.

No counts move (traits aren't doc-count guarded; the spell + condition are pre-existing).

**Tests** ([tests/unit/engine/slice-527-monster-at-will-invisibility.test.ts](tests/unit/engine/slice-527-monster-at-will-invisibility.test.ts), 9 cases — 3 monsters × 3 assertions each via `it.each`): trait shape ships correctly; effect stack projects `grantedSpells().invisibility` with `at-will` + `CHA`; `engine.plan.castSpell` resolves with `ConditionApplied(invisible)` + `ConcentrationStarted` and **no** `SpellSlotConsumed` / `PactSlotConsumed`.

**Documented RAW deviations (deferred, all three monsters):**
- "Requiring no spell components" — the engine doesn't gate cast-spell on V/S/M availability (components are narrative); non-deviation in practice.
- Imp + Quasit Shape-Shift action stays deferred (needs monster-action polymorph primitive).
- Quasit Scare (1/Day) reaction stays deferred (needs per-day-uses + reaction-with-save-or-condition primitive).
- Sprite Enchanting Bow (ranged 1-piercing + Charmed-on-hit) stays deferred (small slice; would be a slice-321 mirror).

**Audit (content-sweep abbreviated):**
- **Names:** GrantSpell trait shape matches the existing slice-513 invocation pattern verbatim.
- **DRY:** zero new mechanism; three pre-existing slices compose. No new identifiers anywhere.
- **SRP:** each composed slice still does one thing; this slice authors three monster traits.
- **Magic numbers:** none.
- **Mechanical outcomes asserted:** trait shape, effect-stack projection, end-to-end cast emits the right events and skips the slot consumption event.

**Pattern-check:** this slice changes how to think about monster spellcasting going forward. The deferred-mechanics doc ([docs/gaps-monsters-deferred-mechanics.md](docs/gaps-monsters-deferred-mechanics.md)) lists "Innate Spellcasting (per-spell envelope flavor)" as a substantial deferred primitive needing "monster-spellcasting deferral... per-spell at-will / per-day usage envelope." **For the at-will arm specifically, that primitive already exists.** Authoring a monster trait `{kind: 'GrantSpell', spellId: X, preparation: 'at-will', spellcastingAbility: Y}` is the canonical shape. **The per-day arm still needs a new primitive** (per-spell usage counter + per-day reset trigger), but the at-will arm should be migrated from the "deferred" list to the "wire as content" list.

The at-will-spell monsters in the pack that should next get this treatment (per the deferred-mechanics doc's Innate Spellcasting list): Cloud Giant (Detect Magic, Fog Cloud), Storm Giant (Detect Magic, Feather Fall, Levitate, Light), Couatl (Detect Evil and Good, Detect Magic, Detect Thoughts), Unicorn (Detect Evil and Good, Druidcraft, Pass without Trace), Deva, Planetar, Solar (Detect Evil and Good, Invisibility self-only). Each is a 1-3-line content slice now, not a new-primitive slice. Tracked.

---

**Content (slice 526): Quasit Rend natural weapon — completes the Pact of the Chain familiar combat surface**

Wires the Quasit's Rend action per RAW. Same shape as Giant Centipede Bite (slice 477) but slashing instead of piercing. Quasit's Magic Resistance was already wired; Invisibility / Shape-Shift / Scare stay deferred (each requires its own primitive). **This closes the Pact of the Chain familiar combat surface: all 7 RAW special-form familiars (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite, Imp, Quasit, Skeleton) now have wired primary-attack routes.** (Skeleton uses generic Shortsword/Shortbow + has no RAW Multiattack.)

RAW (SRD 5.2.1 Quasit, CR 1, Tiny Fiend (Demon)): "Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage, and the target has the Poisoned condition until the start of the quasit's next turn."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `quasit-rend` weapon definition: 1d4 slashing primary + slice-321 unconditional onHit `applyConditionId: 'poisoned'` rider (Giant Centipede Bite mirror, recolored to slashing).

**Doc-count updates:** pack weapons 79 -> 80, items 543 -> 544.

**Documented RAW deviations (still deferred):**
- **Invisibility** (action, at-will, self-cast): sibling gap with Imp + Sprite. Needs the monster-action-self-cast-condition primitive.
- **Shape-Shift** (action; polymorph between true form / bat / centipede / toad with speed-only stat changes): sibling gap with Imp. Needs the monster-action-polymorph primitive composed with the existing spell-side polymorph planner.
- **Scare** (1/Day reaction, WIS DC 10 -> Frightened with recurring end-of-turn save, 1-min auto-success): needs the per-day-uses + reaction-with-save-or-condition primitive. Sibling shape with Burst of Ingenuity (Sphinx of Wonder, slice 524) on the per-day-uses + reaction half.
- Poisoned condition duration ("until the start of the quasit's next turn") is consumer-managed (mirror of slice 286, shared with all per-turn condition-rider weapons).

**Tests** ([tests/unit/engine/slice-526-quasit-rend.test.ts](tests/unit/engine/slice-526-quasit-rend.test.ts), 3 cases): natural weapon RAW damage profile + Poisoned rider; statblock retains pre-existing Magic Resistance + has no Multiattack; **all 7 Pact of the Chain familiars now have a wired primary-attack route** (5 monster-specific natural weapons + Skeleton's generic Shortsword/Shortbow).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Rend; deferred Invisibility / Shape-Shift / Scare documented; no new identifiers beyond the weapon id.

**Pattern-check:** the Pact of the Chain familiar cohort (slices 518-526) is the clearest case study yet of "complete a cohort via incremental natural-weapon slices." Eight slices touched the cohort directly or indirectly:
- 518 (Pact of the Blade primitive)
- 519 (Pact of the Chain primitive + 6-of-7 familiars in pack)
- 522 (Venomous Snake statblock — closed 519 follow-up)
- 523 (Pseudodragon Bite + Multiattack)
- 524 (Sphinx of Wonder Rend)
- 525 (Imp Sting)
- 526 (Quasit Rend)

The natural-weapon-with-onHit-rider shape (slices 316/321) carried 5 of these slices in essentially one-line authoring tasks each. The remaining Pact-Chain-cluster gaps (at-will Invisibility, Shape-Shift, monster reaction-with-save) are sibling-shaped across familiars and would unblock multiple monsters per slice — those are the natural next L1-monster-sweep primitives, but each is a substantial slice on its own. Documented above per-familiar so a future slice can scope them as a cluster.

---

**Content (slice 525): Imp Sting natural weapon**

Wires the Imp's Sting action per RAW. Same shape as slice 524's Sphinx of Wonder Rend (single attack + on-hit damage rider) but with a piercing primary + poison rider instead of slashing + radiant. Imp's Magic Resistance was already wired (pre-existing `GrantMagicResistance`); its Shape-Shift, at-will Invisibility, and Devil's Sight stay deferred (each requires its own primitive — see deviations below).

RAW (SRD 5.2.1 Imp, CR 1, Tiny Fiend (Devil)): "Sting. Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage plus 7 (2d6) Poison damage."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `imp-sting` weapon definition: 1d6 piercing primary + slice-316 unconditional onHit 2d6 poison rider (Spy Shortsword mirror).

**Doc-count updates:** pack weapons 78 -> 79, items 542 -> 543.

**Documented RAW deviations (still deferred):**
- **Invisibility** (action, at-will, self-cast): needs the monster-action-self-cast-condition primitive. Sibling gap with Quasit, Sprite (the Pact-Chain Invisibility cluster).
- **Shape-Shift** (action; polymorph between true form / rat / raven / spider with speed-only stat changes): needs the monster-action-polymorph primitive composed with the existing spell-side polymorph planner. Sibling gap with Quasit.
- **Devil's Sight**: narrative (magical-darkness vision; the engine doesn't model magical darkness as obscurement).

**Tests** ([tests/unit/engine/slice-525-imp-sting.test.ts](tests/unit/engine/slice-525-imp-sting.test.ts), 2 cases): natural weapon RAW damage profile; statblock retains pre-existing Magic Resistance + has no Multiattack (RAW correctness).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Sting; deferred Invisibility / Shape-Shift / Devil's Sight documented; no new identifiers beyond the weapon id.

**Pattern-check:** Imp Sting joins the "single-attack natural weapon with on-hit damage rider" family (now Spy Shortsword poison, Giant Spider Bite, Venomous Snake Bite, Sphinx of Wonder Rend, Imp Sting). At 5+ members the shape is fully routine; on-hit damage-rider weapons are one-line authoring tasks. **Quasit Claws is the natural next sibling** (same shape: 1d4 slashing + 2d4 poison per Quasit RAW, but Quasit also has the same Shape-Shift + Invisibility cluster).

**Closes another Pact-of-the-Chain familiar combat gap.** With Imp's primary attack wired, **5 of 7 Chain familiars** (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite, Imp) can attack via the engine's combat pipeline. Quasit + Skeleton (Skeleton is already combat-complete via generic Shortsword/Shortbow + no RAW Multiattack — surfaced this slice; was previously listed as a remaining gap in slice 524's CHANGELOG, corrected here) round out the cohort.

---


Per-slice detail for slices 520-524 (L1-completion-followed-by-monster-sweep arc: Spare the Dying + `stabilize` mechanic; Expeditious Retreat + `planExpeditiousRetreatDash`; Venomous Snake statblock closing slice 519's follow-up; Pseudodragon Bite + Multiattack; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 517-519 (L1-RAW-strict Pact boon completion arc: ChoiceResolved cascade primitive + Pact of the Tome canonical user; Pact of the Blade + `GrantPactBlade` marker + `planConjurePactWeapon`; Pact of the Chain + `GrantPactChain` marker + at-will Find Familiar free-cast) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind + `event.isConcentrationCheck` save fact; Repelling Blast + `PushTarget` TriggerAction + `event.source` damage fact + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 506-512 (Cleric Divine Order test; Floating Disk reclassification; Skilled origin feat; stale-note sweep; Warlock invocation foundation — choice mechanism + Agonizing Blast + `event.spellId` + `GrantFeat` indirection + per-cantrip variants) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 501-505 (Shillelagh + `weapon-buff` mechanic; Ensnaring Strike + `largeCreatureAdvantage` + `extraDicePerSlotLevel`; Weapon Mastery enforcement; Rogue Thieves' Cant stale-stub sweep; Wizard Ritual Adept marker promotion) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 496-500 (zone-cohort sweep: Silence / Move Earth / Reverse Gravity / Earthquake; Ice Knife + `targetScope`; Sorcerous Burst + `explodeOnMaxDie`; Goodberry + `create-item` + inventory grant; Animal Friendship + `targetCreatureType` + `conditionEndsOnDamage`) is archived at [docs/changelog/archive-slices-496-500.md](docs/changelog/archive-slices-496-500.md) (slice 503, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 491-495 (Boar Gore + `event.attackerChargedThisTarget`; Web Walker + `restrained-by-web`; Death Dog disease + RecurringSave `'longRest'`; True Strike + `weaponAttack`; the positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness) is archived at [docs/changelog/archive-slices-491-495.md](docs/changelog/archive-slices-491-495.md) (slice 499, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 487-490 (non-spellcaster Magic Initiate cast path; Cockatrice Petrifying Bite + `escalateToCondition`; Hippogriff Flyby + `MovementMode`; Stirge Blood Drain) is archived at [docs/changelog/archive-slices-487-490.md](docs/changelog/archive-slices-487-490.md) (slice 494, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + `consumeOnIncomingAttack`, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490, to keep this file under the 60 KB single-Read ceiling).
Per-slice detail for slices 472-481 (the post-alpha.15 iconic-encounter content sweep: Scout / Cultist / Spy / Pack Tactics / Giant Spider+Centipede / Hippogriff / Brown Bear / Black Bear / Pirate Multiattacks and weapons) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487, to keep this file under the 60 KB single-Read ceiling).

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
