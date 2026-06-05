# Slice 649 — content + audit cleanup: L3 stub sweep (3 of 4)

**Type:** Content sweep + audit refactor (no engine code change).

Closes 3 of the 4 non-planner stubs from slice 645's Section 4. The 4th (`circle-of-the-land / circle-of-the-land-spells`) is genuinely bigger — 8 land types × ~4 spells each = 30+ spell-grants — and stays on the punch list as a dedicated follow-up slice.

## What changed

### Three content stubs flipped to wired

| Class / subclass | Feature | RAW arm wired | Deferred arm |
|---|---|---|---|
| Barbarian L3 | `primal-knowledge` | `OfferChoice` over the 6 L1 Barbarian skills (Animal Handling / Athletics / Intimidation / Nature / Perception / Survival), `oneOf: 1`, each option grants the chosen skill proficiency. | "while Rage is active, use STR for Acrobatics / Intimidation / Perception / Stealth / Survival checks" — needs an ability-substitution primitive the engine doesn't have yet. |
| Druid Circle of the Land L3 | `circle-of-the-land-cantrip` | `OfferChoice` over the 11 Druid cantrips in the pack (Guidance, Druidcraft, Mending, Message, Poison Spray, Produce Flame, Resistance, Shillelagh, Spare the Dying, Starry Wisp, Elementalism), `oneOf: 1`, each option grants the chosen cantrip via `GrantSpell { preparation: 'at-will' }`. | — |

### One stub reclassified as intentionally narrative

| Subclass | Feature | Reclassification |
|---|---|---|
| Ranger Hunter L3 | `hunters-lore` | Per RAW, this reveals immunity/resistance/vulnerability info for creatures marked by Hunter's Mark. The engine has no "shown-information" primitive (it's a player-facing reveal, not a mechanical state change), so the feature stays `effects: []` and is correctly classified as consumer-side narrative. The L3 floor's Section 4 reason text now reflects this. |

### L3 floor Section 4 reshuffle

The slice-645 stub list went from 7 entries to 5, organized into three groups:

| Group | Entries | Status |
|---|---|---|
| **Planner-wired-stays-empty** | `rogue / steady-aim`, `monk / deflect-attacks`, `thief / fast-hands` | Intentionally `effects: []`; wiring is via planners (slices 646-648). Pin catches a regression that adds declarative effects without intent. |
| **Intentionally narrative** | `hunter / hunters-lore` | Stays `effects: []` permanently unless a "DM-reveal" primitive lands. |
| **Still-unwired content** | `circle-of-the-land / circle-of-the-land-spells` | Genuine remaining content gap for L3. |

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**:
  - `barbarian.levelTable['3'].features['primal-knowledge'].effects`: was `[]`; now ships one `OfferChoice` with 6 options.
  - `subclasses['circle-of-the-land'].levelGrants['3']['circle-of-the-land-cantrip'].effects`: was `[]`; now ships one `OfferChoice` with 11 options.
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**:
  - `EMPTY_STUBS` table: 7 → 5 entries, regrouped with new comments naming the three categories (planner-wired-intentional, narrative, still-unwired).
  - The two flipped features (`primal-knowledge`, `circle-of-the-land-cantrip`) are removed from the stub list because they no longer ship `effects: []`. The slice-645 Section 4 pin asserts `effects.length === 0`; with effects now present, those assertions would fail. Removing them from the table is the right cleanup (the audit's job is to track unwired content; wired features don't need the pin).
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regenerated via `-u` (two-line addition: `barbarian L3 primal-knowledge` + `circle-of-the-land L3 circle-of-the-land-cantrip`). Inspected; matches the feature-coverage matrix exactly.

## Tests

- `npx vitest run tests/audit/srd-l3-complete.test.ts`: 30/30 pass (was 32; -2 from the removed stub entries).
- Full suite: 512 files / 3569 passing + 173 skipped (unchanged from slice 648 — no new tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Content additive.** New `OfferChoice` effects on two L3 features. Old characters built before this slice don't auto-acquire the choices (the engine doesn't retroactively grant choices on state reconciliation; the `OfferChoice` cascade fires at character creation / level-up). New characters built post-slice will be prompted.

**No engine change.** Pure content + audit edit.

## Audit (Uncle Bob)

- **Names**: choice ids (`barbarian-primal-knowledge`, `circle-of-the-land-cantrip`) name the feature they belong to. Option ids match the skill / cantrip id directly so a future audit cross-checking option-id-vs-grant-id finds them aligned.
- **DRY**: option shape is identical across the 6 barbarian skill options (just the skill id varies) and across the 11 druid cantrip options. The JSON repetition is intentional — the pack format is declarative, no code abstraction available. When a content authoring DSL eventually lands (e.g. "OfferChoice over a skill list helper"), the repetition collapses.
- **SRP**: each content row does one thing (offer a single choice). The audit's three-group reorganization makes the intent of each stub category explicit.
- **Magic numbers / strings**: skill / cantrip ids match the pack's existing canonical ids. `oneOf: 1` matches the RAW "one of your choice."
- **Pattern-check**: scanned for other "preparation: 'atWill'" typos in the pack — none. The slice-633 floor's slice-638 lesson (audit-correction via re-grep) applied during authoring: the initial write used `'atWill'` (camelCase) which the OfferChoice's nested EffectSchema rejected with "Invalid input"; verified the canonical literal is `'at-will'` (hyphenated) and fixed.

## Open follow-ups

**L3 punch list remaining**:
- **circle-of-the-land-spells** — 8 land types × per-land spell list (~3-4 spells per land at L3/L5/L7/L9 tiers). Substantial content authoring; its own slice.
- **Primal Knowledge ability-substitution arm** — "while Rage is active, use STR for Acrobatics / Intimidation / Perception / Stealth / Survival." Needs a new engine primitive ("ability-substitution per check while condition active"). Deferred until the broader ability-substitution use case (Strength Athletics for grapples, etc.) motivates it.
- **L3 hardening cycle** (slice 650+): resource scaffolding pin (Paladin Channel Divinity at L3, Sorcerer SP=3, Barbarian Rage=3, Monk Focus=3), subclass spell-list scaffolding, L3 fuzz matrix extension. Mirror of L2 cycle's slices 639-644.

When the remaining punch-list items close, tag `0.4.0-alpha.0` ("L3 SRD complete").
