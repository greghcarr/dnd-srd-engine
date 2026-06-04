# Archive: slices 506-512

This file holds the per-slice changelog detail for slices 506-512, archived from the live CHANGELOG.md in slice 517 to keep that file under the 60 KB single-Read ceiling. Cohort: the L1-completion polish arc — Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation (choice mechanism, Agonizing Blast canonical user, `event.spellId` damage fact, `GrantFeat` indirection primitive, per-cantrip Agonizing Blast generalization).

Picks up where [archive-slices-501-505.md](archive-slices-501-505.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

**Content + test (slice 512): per-cantrip generalization for Agonizing Blast — 3 invocation Feat variants**

Closes the slice-510/511 documented RAW deviation: Agonizing Blast was hardcoded to Eldritch Blast; RAW lets the warlock pick any known Warlock damage cantrip. The starter pack lists three such cantrips (Eldritch Blast, Chill Touch, Poison Spray), and this slice authors one Feat variant per cantrip — the warlock's L1 invocation OfferChoice now exposes three labeled options ("Agonizing Blast (Eldritch Blast)" / "(Chill Touch)" / "(Poison Spray)"), each granting its corresponding feat. The player's pick at acquisition time IS the cantrip choice; no nested OfferChoice or ChoiceResolved-cascade needed for the one-cantrip-pick case.

RAW (Agonizing Blast): "Choose one of your known Warlock cantrips that deals damage. You can add your Charisma modifier to that spell's damage rolls."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- `agonizing-blast` Feat renamed to `agonizing-blast-eldritch-blast` (the Eldritch Blast variant; same effects).
- New `agonizing-blast-chill-touch` and `agonizing-blast-poison-spray` Feat rows (category: 'invocation', repeatable: false, prerequisites name the cantrip), each with `AddModifier(damage, CHA-mod)` gated on its own `event.spellId`.
- Warlock L1 `eldritch-invocations-2` OfferChoice's options: 1 → 3 (one per variant), each `[{ kind: 'GrantFeat', featId: '<variant>' }]`.

**Tests** at [tests/unit/engine/slice-512-agonizing-blast-per-cantrip.test.ts](../../tests/unit/engine/slice-512-agonizing-blast-per-cantrip.test.ts) - 4 cases: the pack ships all three variants with the right per-cantrip `event.spellId` condition; the warlock L1 OfferChoice exposes all three; picking the Chill Touch variant adds +CHA-mod to Chill Touch only (not Eldritch Blast or Poison Spray); picking the Poison Spray variant adds +CHA-mod to Poison Spray only. Updated slice-510 + slice-511 tests to reference the renamed feat id.

**Doc-count update**: `getting-started.md` feats total 19 → 21 (3 invocation feats instead of 1). Features snapshot updated to include the two new wired feat ids.

**Documented design note** (deferred): the per-cantrip-variant content pattern (1 invocation × N cantrips = N feats) is intentionally simple. A future multi-pick invocation — Pact of the Tome lets the warlock pick 3 cantrips — will need a real `ChoiceResolved`-cascade mechanism in `applyChoiceResolved` (so a resolved option's effects can install follow-up PendingChoices for nested OfferChoices in the granted feat's effects). The per-variant pattern doesn't scale to multi-pick combinatorics. Tracked.

**Audit:**
- *RAW match*: any of the 3 warlock damage cantrips can now be chosen as the Agonizing Blast target. Repeatability is across variants (the warlock could pick a different cantrip's variant at a later tier).
- *Names*: feat id `agonizing-blast-<cantrip-id>` is the established sibling-feat pattern (parallel to `magic-initiate-{cleric,druid,wizard}`).
- *DRY*: each variant feat is one AddModifier; the only field that differs is the spellId in the condition.
- *SRP*: each variant does one thing — gate the CHA-mod fold on one cantrip's id.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: schema shape, OfferChoice shape, per-variant projection isolation (each variant fires only for its named cantrip).

**Pattern-check**: the renamed feat id propagated symmetrically into slice-510 + slice-511 (sed across both test files; one assertion's `repeatable` flag flipped from `true` to `false` since per-variant feats don't repeat). Any future invocation with a single-pick parameter (Whispers of the Grave's chosen-language, Mask of Many Faces' chosen alternate form when added) can mirror this per-variant content pattern without engine work.

**Engine + content (slice 511): `GrantFeat` primitive + refactor Agonizing Blast as a Feat content row**

Adds the indirection primitive that makes the Warlock invocation catalog (and any future "feat-as-content" cohort) scale cleanly. Before this slice each invocation's effects would have to be inline-duplicated in every tier OfferChoice's option list — for the Warlock's 8 tiers and ~30 invocations that's a quadratic content explosion. After this slice each invocation is a single Feat row; each tier OfferChoice's option just grants the feat by id.

**Engine:**
- New `GrantFeat { featId: string }` effect kind ([src/schemas/effects.ts](../../src/schemas/effects.ts) — added to union, Zod, and `EFFECT_KINDS`). Indirection primitive: lets an effect projection include another Feat's effects by id.
- New `expandGrantFeatEffects(effects, content, visited?)` helper in [src/derive/effect-stack.ts](../../src/derive/effect-stack.ts): walks an effects array, recursively replaces each `GrantFeat { featId }` with the referenced feat's expanded effects, with cycle protection (visited set; a feat that transitively grants itself is broken at the second visit). Unknown `featId` references are silently dropped (graceful degradation).
- Wired into `buildEffectStack` at every source loop (species, background, class, feat, item, monster, resolved-choice) AND into `collectEffectsFromCharacter`. The builder switch treats raw `GrantFeat` as a no-op so any path that bypasses expansion degrades gracefully.
- `category: 'invocation'` added to the FeatSchema enum (mirror of the existing `'origin'` / `'general'` / `'fighting-style'` / `'epic-boon'` values).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `agonizing-blast` Feat (category: 'invocation', repeatable: true, prerequisites: `['Warlock', 'Eldritch Blast cantrip']`) with the inline `AddModifier(damage, CHA-mod)` gated on `event.spellId == eldritch-blast`. Moved verbatim from the slice-510 inline option.
- Warlock L1 `eldritch-invocations-2` OfferChoice option's effects: `[AddModifier ...]` → `[{ kind: 'GrantFeat', featId: 'agonizing-blast' }]`. **Behavior identical to slice 510 end-to-end** (the slice-510 test continues to pass without modification); only the wire shape changed.

**Doc-count update** (CI-guarded): `EFFECT_KINDS` 56 → 57 (55 → 56 primitives + `Custom`). Updated [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md) + [docs/concepts.md](../../docs/concepts.md).

**Documented deferral**: the per-cantrip generalization (RAW Agonizing Blast lets the warlock pick any known Warlock damage cantrip, not just Eldritch Blast) stays open. Modeling it needs either (a) a `ChoiceResolved`-cascade mechanism in `applyChoiceResolved` (so a resolved option's effects can install follow-up PendingChoices for nested OfferChoices in the granted feat's effects), or (b) a parameterized invocation shape (the OfferChoice option carries a cantrip-id parameter the feat reads). Both are architectural decisions worth a dedicated design slice. The `GrantFeat` indirection this slice ships is the necessary precondition for either path.

**Tests** at [tests/unit/engine/slice-511-grant-feat.test.ts](../../tests/unit/engine/slice-511-grant-feat.test.ts) - 6 cases: the pack ships Agonizing Blast as a Feat with the expected inline effects; the warlock L1 OfferChoice option uses `GrantFeat` (not inline effects); `expandGrantFeatEffects` recursively resolves a `GrantFeat` to the feat's effects; the expansion breaks self-referential cycles via the `visited` set; an unknown `featId` is dropped gracefully (no throw); end-to-end the warlock's effect stack projects the AddModifier through the choice → GrantFeat → expansion → builder chain.

**Audit:**
- *RAW match*: behavior identical to slice 510 (CHA-mod added to Eldritch Blast damage rolls when the invocation is picked). The hardcoded-to-Eldritch-Blast deviation is unchanged and documented above.
- *Names*: `GrantFeat` parallels `GrantSpell` (indirection by id). `expandGrantFeatEffects` is intention-revealing.
- *DRY*: the expansion lives in one place; every source loop in `buildEffectStack` wraps its effects with the same helper.
- *SRP*: the helper does one thing (recursive expansion); the schema entry is one new effect kind.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: schema shape, content shape, expansion semantics (happy / cycle / unknown), end-to-end projection.

**Pattern-check**: every effect-source loop in `buildEffectStack` got the same expansion wrapper — species, background, class, feat, item, monster, AND resolved-choice. The builder switch's no-op for `GrantFeat` is a safety net for any path that bypasses expansion (the conditions loop currently doesn't expand — conditions don't reference invocation feats today, and the no-op preserves correctness).

**Engine + content (slice 510): Warlock L1 Eldritch Invocations choice mechanism + Agonizing Blast canonical user + `event.spellId` damage fact**

Opens the Warlock invocations arc. The L1 `eldritch-invocations-2` feature was an `effects: []` stub; now ships an `OfferChoice oneOf: 1` whose first option is **Agonizing Blast** with inline effects (`AddModifier target:'damage' value:abilityMod-CHA condition: eq event.spellId 'eldritch-blast'`). Additional invocations are future content slices; this one establishes the wire shape.

RAW (SRD 5.2.1 Warlock L1 Eldritch Invocations): "You gain one invocation of your choice."
RAW (Agonizing Blast invocation): "Choose one of your known Warlock cantrips that deals damage. You can add your Charisma modifier to that spell's damage rolls."

**Engine** ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- Added `event.spellId: spell.id` to BOTH the attack-mechanic and save-mechanic damage-facts maps (lines ~441 and ~632), enabling per-spell damage riders via `AddModifier ... condition: eq event.spellId '<id>'`. Mirror of how slice 359 added `event.spellSchool` for Empowered Evocation.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Warlock L1 `eldritch-invocations-2`: `effects: []` → single `OfferChoice oneOf: 1` over options `[{ agonizing-blast → AddModifier(damage, CHA-mod) gated on eldritch-blast }]`.

**Documented RAW deviations (this first ship):**
- The invocation is wired statically to Eldritch Blast. RAW lets the warlock pick any known Warlock damage cantrip; modeling that needs an inner sub-choice inside the option (an OfferChoice within an OfferChoice option's effects, or a `damageBoostsSpell` parameterized field). Deferred. Eldritch Blast is the only Warlock-class-listed damage cantrip in the pack, so the deviation rarely matters in practice.
- The full invocation catalog (Mask of Many Faces, Devil's Sight, Pact of the Tome/Blade/Chain, etc.) is a multi-slice content authoring effort; this slice ships only the L1 choice mechanism + Agonizing Blast.
- The L1 feature is still named `eldritch-invocations-2` ("(2 known)") — off-by-one from RAW (L1 grants 1, not 2). Renaming has blast radius across the slice-377 drift audit and content references; left for a separate cleanup slice. The `OfferChoice oneOf: 1` correctly grants 1 invocation regardless of the misleading name.

**Tests** at [tests/unit/engine/slice-510-agonizing-blast.test.ts](../../tests/unit/engine/slice-510-agonizing-blast.test.ts) - 4 cases: the L1 feature ships the OfferChoice with Agonizing Blast as the first option; a warlock who picks Agonizing Blast adds +4 CHA-mod to Eldritch Blast damage (verified via both `modifierSum` on the effect stack with `event.spellId` facts AND end-to-end via DamageRolled.rolls[0].modifier === 4); a warlock who has NOT picked the invocation deals no extra damage; the invocation does NOT add CHA-mod to other cantrips (gated on spellId, fire-bolt unaffected).

**Audit:**
- *RAW match*: 1 invocation choice at L1; Agonizing Blast adds CHA-mod to Eldritch Blast damage rolls. The hardcoded-Eldritch-Blast vs. per-cantrip-choice is the documented deviation.
- *Names*: `event.spellId` mirrors `event.spellSchool` / `event.damageType` (existing per-spell-property fact pattern).
- *DRY*: reuses the existing AddModifier + condition + modifierSum chain (precedent: Empowered Evocation slice 359). The OfferChoice option is inline; future invocations will inline-duplicate effects too unless a `GrantFeat` primitive ships first to deduplicate.
- *SRP*: `event.spellId` is one field on two facts maps; the invocation is one inline effect on one option.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: feature shape, effect-stack `modifierSum` projection (both matching and non-matching spellId), end-to-end damage delta with/without the invocation.

**Pattern-check**: both damage paths in cast-spell.ts (attack + save) got the new `event.spellId` fact symmetrically. Any future per-spell damage rider (e.g., Bloodbond Hex variants) can gate on it. No regression: existing AddModifier predicates that don't reference `event.spellId` evaluate identically.

**Docs (slice 509): strike two more stale L1-feature notes (Bardic Inspiration formula + Barbarian L1 Weapon Mastery)**

Pattern-check sweep continuing from slice 504's stale-stub discoveries. Two more notes in [docs/gaps-class-features.md](../../docs/gaps-class-features.md) describe gaps that no longer exist:
- **Bardic Inspiration use-count formula** claimed "still hardcoded at 3 instead of CHA-mod-with-floor-1." The L1 `bardic-inspiration` feature actually ships `GrantResource.max = max(1, abilityMod CHA)` — exactly RAW.
- **Barbarian L1 Weapon Mastery** claimed "not in the current pack — the L1 row only ships Rage + Unarmored Defense." Closed by slice 378 (noted at the top of the same doc, but this open-item line wasn't struck). The Barbarian L1 features array ships `weapon-mastery-barbarian` with `GrantWeaponMastery` (slots: 2, all 8 RAW masteries), enforced by the slice-502 gate.

Both notes struck with closed-by annotations. Pure docs slice — no engine / content / test changes.

**Content + test (slice 508): Skilled origin feat — wire the 3-pick OfferChoice over 18 skills + 37 tools**

Closes the last gettable L1 origin-feat gap. The `skilled` feat previously shipped `effects: []` (a no-op stub) — content authoring with no engine block. Now ships an `OfferChoice` with `oneOf: 3` over 55 options (18 skills + 37 tools, each option granting `GrantProficiency` for the picked target).

RAW (SRD 5.2.1 Skilled, Origin Feat, Repeatable): "You gain proficiency in any combination of three skills or tools of your choice."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- `skilled` feat: `effects: []` -> single OfferChoice with `oneOf: 3, options: [...18 skill + 37 tool...]`. Each option's effects array is one `GrantProficiency` grant for that skill or tool. Pack file grew ~9 KB; JSON parses, schema validates.

**Tests** at [tests/unit/engine/slice-508-skilled.test.ts](../../tests/unit/engine/slice-508-skilled.test.ts) - 3 cases: the feat ships the OfferChoice with exactly 55 options (18 skills + 37 tools); a mixed pick (1 skill + 2 tools) projects all three proficiencies; a pure-skills pick (3 skills) also projects. Mirror of the slice-215 / slice-506 OfferChoice-resolution template (seed `ChoiceRequired` + `ChoiceResolved`, read `proficiencyLevel` from the effect stack).

**Pure content + test slice — no engine changes.**

**Audit (short):**
- *RAW match*: any-three-from-skills-or-tools, repeatable. `OfferChoice.oneOf: 3` is the engine's standard multi-pick shape (precedent: `magic-initiate-*-cantrips` use `oneOf: 2`, `rogue-expertise-l1/l6` use `oneOf: 2`).
- *Names*: option ids reuse the canonical skill/tool ids already in the pack.
- *DRY*: option list generated mirroring the existing Human Skillful skill-option shape + the pack's tool catalog; no hand-curated copy.
- *Mechanical outcomes asserted*: 18+37 = 55 options shape, mixed-pick projection, all-skills-pick projection.

**Pattern-check**: every other 2024 origin feat shipping in the pack is now either fully wired or correctly using an engine-recognized-by-id pattern (`savage-attacker` via the attack planner's `getEffectiveFeatIds` consumer, like Monk Martial Arts). The remaining feat stubs are deliberately outside L1 scope (general feat `grappler`, 5 epic-boon feats — all L4+/L19+ entries).

**Test + docs (slice 507): Floating Disk — reclassify the last L1 "deferred" entry as consumer-side narrative + lock the cast path**

Closes the last L1 spell formerly classified as "deferred." Floating Disk is misclassified: the *cast* itself works through `planCastSpell` (Action consumes a slot; Ritual doesn't; neither emits mechanical events), but the *disk* is a positional carry-capacity world entity (500-lb capacity, follows the caster within 20 ft, can't cross 10-ft elevation changes, falls off when overloaded) that the engine explicitly doesn't model per the no-positions stance. It belongs in the narrative bucket alongside the other consumer-side utility spells, not in the deferred queue.

RAW (SRD 5.2.1 Floating Disk, L1 Wizard Conjuration, Action or Ritual, 30 ft range, 1 hour, NOT concentration, IS ritual): see the spell text in [references/srd-markdown/spells.md](../../references/srd-markdown/spells.md).

**No engine or content changes** — pure reclassification + cast test.

[tests/unit/engine/slice-507-floating-disk.test.ts](../../tests/unit/engine/slice-507-floating-disk.test.ts) - 3 cases: the spell ships `mechanicalEffects: []` (ritual: true, concentration: false); cast as Action consumes a spell slot and emits no downstream effect events (no ConcentrationStarted / DamageApplied / SaveRolled / AttackRolled / ConditionApplied); cast as Ritual does NOT consume a slot and similarly emits no downstream events. spell-coverage skip reason updated to point at this file.

**Doc-count update**: L1 row 44 wired / 12 narrative / 1 deferred -> 44 wired / 13 narrative / 0 deferred. Headline 196 wired / 69 narrative / 74 deferred -> 196 wired / 70 narrative / 73 deferred. **The L1 spell surface is now formally complete: 0 deferred entries.** Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Documented RAW deviations (consumer-managed, never engine-modeled)**: the disk's 500-lb capacity, the follow-the-caster behavior (immobile within 20 ft of caster; follows when caster moves > 20 ft away), the 10-ft elevation gate, and the fall-off-when-overloaded behavior all stay engine-out-of-scope, consistent with the "engine doesn't model positions" stance ([CLAUDE.md](../../CLAUDE.md)).

**Test (slice 506): Cleric L1 Divine Order — lock both sub-feature projections via PendingChoice resolution**

Closes the slice-504 tracked follow-up: Divine Order was already wired as an `OfferChoice` (Protector / Thaumaturge), but no test pinned the projection of each chosen sub-feature.

[tests/unit/engine/slice-506-divine-order.test.ts](../../tests/unit/engine/slice-506-divine-order.test.ts) seeds the `ChoiceRequired` + `ChoiceResolved` pair (mirror of the slice-215 [druid-primal-order.test.ts](../../tests/unit/engine/druid-primal-order.test.ts) template) and asserts:
- **Protector**: `proficiencyLevel('weapon', 'martial')` and `('armor', 'heavy')` both resolve to `'proficient'`; no Guidance grant.
- **Thaumaturge**: `grantedSpells()` lists `guidance` (always-prepared); `computeAbilityCheck` returns the expected totals — Arcana (INT) = 0 + WIS(+3) + sage PB(+2) = 5; Religion (WIS) = WIS(+3) + WIS(+3) = 6. Martial / heavy-armor proficiency NOT granted.

Doc: [docs/gaps-class-features.md](../../docs/gaps-class-features.md) — slice-504's "Open follow-up" line struck with a closed-by annotation referencing the new test file.

Pure test slice — no engine or content changes.

