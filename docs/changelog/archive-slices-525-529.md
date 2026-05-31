# Archive: slices 525-529

This file holds the per-slice changelog detail for slices 525-529, archived from the live CHANGELOG.md in slice 537 to keep that file under the 60 KB single-Read ceiling. Cohort: the at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep — Imp Sting (525), Quasit Rend completing the Chain familiar combat surface (526), at-will Invisibility for Imp/Quasit/Sprite via the slice-527 pre-existing-composition discovery (527), the slice-528 docs correction reflecting that discovery, and the slice-529 sweep wiring at-will spellcasting across 8 monsters (Cloud Giant, Storm Giant, Couatl, Unicorn, Deva, Planetar, Solar, Dryad) plus 5 missing Magic Resistance traits.

Picks up where [archive-slices-520-524.md](archive-slices-520-524.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

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

**Doc-count updates:** Magic Resistance cohort 36 -> 41 in [docs/status.md](../../docs/status.md).

**Tests** ([tests/unit/engine/slice-529-at-will-spellcasting-sweep.test.ts](../../tests/unit/engine/slice-529-at-will-spellcasting-sweep.test.ts), 23 cases): trait shape + effect-stack projection per (monster, spell); 5 Magic Resistance additions; Couatl-no-MR negative; Cloud Giant end-to-end cast smoke (no SpellSlotConsumed).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses slice 527's pathway. No new identifiers.

**Pattern-check:** closes the at-will half of Innate Spellcasting in one batch. Per-day half remains the only real primitive gap on monster innate spellcasting. The 5 silently-missing-MR fixes illustrate the value of cross-checking SRD RAW against pack content during any sweep; three (Deva, Planetar, Solar) had been missing since the slice-1.15 angel cohort.

---

**Docs (slice 528): reflect slice 527's at-will spellcasting discovery in the deferred-mechanics catalog**

Three entries updated in [docs/gaps-monsters-deferred-mechanics.md](../../docs/gaps-monsters-deferred-mechanics.md):

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

1. **Slice 444-ish**: monster statblock `traits[]` array folds verbatim into the bearer's effect stack ([src/derive/effect-stack.ts](../../src/derive/effect-stack.ts) `collectMonsterEffects` line 223).
2. **Slice 212**: `characterKnowsSpell` consults the effect stack via `effectiveSpellList`, so GrantSpell entries projected from any source (subclass, item, **monster trait**) make the spell castable.
3. **Slice 513**: the cast-spell `noSlotCost` derivation detects `preparation: 'at-will'` on granted spells and skips SpellSlotConsumed emission entirely.

Together, an at-will GrantSpell trait on a monster makes the monster cast that spell for free. No new pathway needed.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Imp `traits` gain `{ kind: 'GrantSpell', spellId: 'invisibility', preparation: 'at-will', spellcastingAbility: 'CHA' }`.
- Quasit `traits` gain the same.
- Sprite `traits` (previously `[]`) become `[{ kind: 'GrantSpell', spellId: 'invisibility', ...}]`.

No counts move (traits aren't doc-count guarded; the spell + condition are pre-existing).

**Tests** ([tests/unit/engine/slice-527-monster-at-will-invisibility.test.ts](../../tests/unit/engine/slice-527-monster-at-will-invisibility.test.ts), 9 cases — 3 monsters × 3 assertions each via `it.each`): trait shape ships correctly; effect stack projects `grantedSpells().invisibility` with `at-will` + `CHA`; `engine.plan.castSpell` resolves with `ConditionApplied(invisible)` + `ConcentrationStarted` and **no** `SpellSlotConsumed` / `PactSlotConsumed`.

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

**Pattern-check:** this slice changes how to think about monster spellcasting going forward. The deferred-mechanics doc ([docs/gaps-monsters-deferred-mechanics.md](../../docs/gaps-monsters-deferred-mechanics.md)) lists "Innate Spellcasting (per-spell envelope flavor)" as a substantial deferred primitive needing "monster-spellcasting deferral... per-spell at-will / per-day usage envelope." **For the at-will arm specifically, that primitive already exists.** Authoring a monster trait `{kind: 'GrantSpell', spellId: X, preparation: 'at-will', spellcastingAbility: Y}` is the canonical shape. **The per-day arm still needs a new primitive** (per-spell usage counter + per-day reset trigger), but the at-will arm should be migrated from the "deferred" list to the "wire as content" list.

The at-will-spell monsters in the pack that should next get this treatment (per the deferred-mechanics doc's Innate Spellcasting list): Cloud Giant (Detect Magic, Fog Cloud), Storm Giant (Detect Magic, Feather Fall, Levitate, Light), Couatl (Detect Evil and Good, Detect Magic, Detect Thoughts), Unicorn (Detect Evil and Good, Druidcraft, Pass without Trace), Deva, Planetar, Solar (Detect Evil and Good, Invisibility self-only). Each is a 1-3-line content slice now, not a new-primitive slice. Tracked.

---

**Content (slice 526): Quasit Rend natural weapon — completes the Pact of the Chain familiar combat surface**

Wires the Quasit's Rend action per RAW. Same shape as Giant Centipede Bite (slice 477) but slashing instead of piercing. Quasit's Magic Resistance was already wired; Invisibility / Shape-Shift / Scare stay deferred (each requires its own primitive). **This closes the Pact of the Chain familiar combat surface: all 7 RAW special-form familiars (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite, Imp, Quasit, Skeleton) now have wired primary-attack routes.** (Skeleton uses generic Shortsword/Shortbow + has no RAW Multiattack.)

RAW (SRD 5.2.1 Quasit, CR 1, Tiny Fiend (Demon)): "Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage, and the target has the Poisoned condition until the start of the quasit's next turn."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `quasit-rend` weapon definition: 1d4 slashing primary + slice-321 unconditional onHit `applyConditionId: 'poisoned'` rider (Giant Centipede Bite mirror, recolored to slashing).

**Doc-count updates:** pack weapons 79 -> 80, items 543 -> 544.

**Documented RAW deviations (still deferred):**
- **Invisibility** (action, at-will, self-cast): sibling gap with Imp + Sprite. Needs the monster-action-self-cast-condition primitive.
- **Shape-Shift** (action; polymorph between true form / bat / centipede / toad with speed-only stat changes): sibling gap with Imp. Needs the monster-action-polymorph primitive composed with the existing spell-side polymorph planner.
- **Scare** (1/Day reaction, WIS DC 10 -> Frightened with recurring end-of-turn save, 1-min auto-success): needs the per-day-uses + reaction-with-save-or-condition primitive. Sibling shape with Burst of Ingenuity (Sphinx of Wonder, slice 524) on the per-day-uses + reaction half.
- Poisoned condition duration ("until the start of the quasit's next turn") is consumer-managed (mirror of slice 286, shared with all per-turn condition-rider weapons).

**Tests** ([tests/unit/engine/slice-526-quasit-rend.test.ts](../../tests/unit/engine/slice-526-quasit-rend.test.ts), 3 cases): natural weapon RAW damage profile + Poisoned rider; statblock retains pre-existing Magic Resistance + has no Multiattack; **all 7 Pact of the Chain familiars now have a wired primary-attack route** (5 monster-specific natural weapons + Skeleton's generic Shortsword/Shortbow).

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `imp-sting` weapon definition: 1d6 piercing primary + slice-316 unconditional onHit 2d6 poison rider (Spy Shortsword mirror).

**Doc-count updates:** pack weapons 78 -> 79, items 542 -> 543.

**Documented RAW deviations (still deferred):**
- **Invisibility** (action, at-will, self-cast): needs the monster-action-self-cast-condition primitive. Sibling gap with Quasit, Sprite (the Pact-Chain Invisibility cluster).
- **Shape-Shift** (action; polymorph between true form / rat / raven / spider with speed-only stat changes): needs the monster-action-polymorph primitive composed with the existing spell-side polymorph planner. Sibling gap with Quasit.
- **Devil's Sight**: narrative (magical-darkness vision; the engine doesn't model magical darkness as obscurement).

**Tests** ([tests/unit/engine/slice-525-imp-sting.test.ts](../../tests/unit/engine/slice-525-imp-sting.test.ts), 2 cases): natural weapon RAW damage profile; statblock retains pre-existing Magic Resistance + has no Multiattack (RAW correctness).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Sting; deferred Invisibility / Shape-Shift / Devil's Sight documented; no new identifiers beyond the weapon id.

**Pattern-check:** Imp Sting joins the "single-attack natural weapon with on-hit damage rider" family (now Spy Shortsword poison, Giant Spider Bite, Venomous Snake Bite, Sphinx of Wonder Rend, Imp Sting). At 5+ members the shape is fully routine; on-hit damage-rider weapons are one-line authoring tasks. **Quasit Claws is the natural next sibling** (same shape: 1d4 slashing + 2d4 poison per Quasit RAW, but Quasit also has the same Shape-Shift + Invisibility cluster).

**Closes another Pact-of-the-Chain familiar combat gap.** With Imp's primary attack wired, **5 of 7 Chain familiars** (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite, Imp) can attack via the engine's combat pipeline. Quasit + Skeleton (Skeleton is already combat-complete via generic Shortsword/Shortbow + no RAW Multiattack — surfaced this slice; was previously listed as a remaining gap in slice 524's CHANGELOG, corrected here) round out the cohort.

