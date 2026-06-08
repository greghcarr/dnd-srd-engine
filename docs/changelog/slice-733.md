# Slice 733 — content: Bard College of Lore Magical Discoveries (L6)

**Type:** Content (subclass feature using existing primitives). Additive. Wires the previously-absent College of Lore L6 row. L6 SRD-complete cycle.

SRD 5.2.1 College of Lore L6 Magical Discoveries: "You learn two spells of your choice. These spells can come from the Cleric, Druid, or Wizard spell list or any combination thereof. A spell you choose must be a cantrip or a spell for which you have spell slots, as shown in the Bard Features table. You always have the chosen spells prepared, and whenever you gain a Bard level, you can replace one of the spells with another spell that meets these requirements."

## What changed

- The `college-of-lore` subclass gains a new `"6"` `levelGrants` row with a `magical-discoveries` feature.
- The feature is an `OfferChoice { oneOf: 2, when: 'onAcquire' }` whose options each grant one Cleric/Druid/Wizard spell via `GrantSpell { preparation: 'always-prepared' }` — the cross-list learn shape established by Pact of the Tome (slice 517).

### No new engine primitive

The cross-list cast already works: the cast path's `characterKnowsSpell` consults `effectiveSpellList`, which folds in `effects.grantedSpells()`, and the gate checks knowledge, not class-list membership. A spell granted `always-prepared` is therefore castable, and `resolveCastingAbility` resolves to the bard's own class (CHA + bard slots) — so a discovered Wizard spell "counts as a Bard spell for you" per RAW. The choice surfaces via `engine.plan.offerCharacterChoices` (slice 618), the standard path for subclass `onAcquire` choices (planLevelUp only walks the base class's `levelTable`).

### Curated option set

The 18 options are a curated, mechanically-wired representative selection across the three lists and levels 0–3 (the levels a L6 bard can cast): cantrips (Sacred Flame, Fire Bolt, Produce Flame, Guidance), L1 (Guiding Bolt, Inflict Wounds, Magic Missile, Chromatic Orb, Entangle), L2 (Spiritual Weapon, Scorching Ray, Moonbeam, Flaming Sphere), L3 (Fireball, Spirit Guardians, Call Lightning, Counterspell, Revivify). This matches the pack convention for spell-picker OfferChoices (Evoker Evocation Savant's 10 options; Pact of the Tome). The engine handles any `GrantSpell`, so widening the list toward the full 99 eligible pack spells is pure content with no code change.

### RAW deviation (deferred)

The "whenever you gain a Bard level, you can replace one of the spells" relearn arm is consumer-driven (OfferChoice `onAcquire` fires once at L6); a per-level swap protocol is the same deferred mechanism noted for the base Bard Magical Secrets (L10).

## Files

- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): `college-of-lore` L6 `magical-discoveries` OfferChoice (18 cross-list always-prepared options).
- [tests/unit/engine/slice-733-magical-discoveries.test.ts](../../tests/unit/engine/slice-733-magical-discoveries.test.ts) (new): feature presence (oneOf 2, all options GrantSpell always-prepared); a L5 lore bard isn't offered it; a L6 lore bard is offered it, and resolving it (Fireball + Spirit Guardians) grants both spells and casts Fireball as a Bard spell (deals damage).
- [tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap): adds `college-of-lore L6 magical-discoveries`.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No new effect kind / condition (no doc-counts change); features coverage snapshot adds the wired subclass feature.

## Audit (Uncle Bob)

- **Reuse**: rides the existing `OfferChoice` + `GrantSpell always-prepared` cross-list machinery (Pact of the Tome, slice 517) and the `offerCharacterChoices` surfacing path (slice 618). No new code.
- **SRD-faithful**: two spells from Cleric/Druid/Wizard lists, always prepared, cast as Bard spells; option levels bounded to a L6 bard's castable range (0–3).
- **Content-only**: a subclass feature expressed purely as data; the relearn-on-level-up arm is the one documented deferral.
