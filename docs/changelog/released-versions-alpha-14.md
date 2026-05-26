# Released versions: 0.1.0-alpha.14

Frozen release narrative for `0.1.0-alpha.14` (2026-05-22), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 471 (the alpha.15 release) per the slice-437 active-cycle invariant. Sibling to [released-versions-alpha-6-13.md](released-versions-alpha-6-13.md) (alpha.6-13) and [released-versions.md](released-versions.md) (alpha.0-5). Per-slice cohort archives for slices 400-435 are indexed in [README.md](README.md).

---

## 0.1.0-alpha.14 - 2026-05-22

**Release (slice 436): bump to 0.1.0-alpha.14**

Promotes the post-alpha.13 cohort (slices 400-435) to a tagged release. `package.json` bumped from `0.1.0-alpha.13` to `0.1.0-alpha.14`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the cohort's only persisted-shape touch is `Character.speedFeet` becoming optional (slice 427, was `.default(30)`), and old saves carry the field so they parse unchanged. The full suite is green at 346 files / 2325 passing; `npm run ci` clean (typecheck + coverage + build).

The headline new surface is the **consumer read/query view-model layer**, the first public API beyond the engine core: new exports `querySpells` / `queryMonsters` / `queryItems`, `buildCharacterSheet`, `buildEncounterView`, plus the standalone derivations `computeWeaponDamage` / `computeUnarmedStrike` / `getEffectiveSpeed` / `getEffectiveSpeeds`. Cohort, in five arcs:

- **SRD / non-SRD content separation + multi-pack policy (400-403):** the multi-pack id-collision policy + report-all validator (400), then the full split of non-SRD content out of the drift-audited starter pack (401 backgrounds + feats, 402 the 12 non-SRD spells + their conditions to `phb-2024-extras`, 403 stop shipping non-SRD content from a gitignored `content-packs/` folder).
- **Plugin / custom-action seam + effect retrofits (405-410):** the plugin API design proposal (405) and the `Custom`-action plan seam (406); the Elemental Weapon (407) and Absorb Elements (408) retrofits onto the new primitives (with a deliberate Thunder-Step stop); the `ContentBundle` single-file user-content shape (409); and a class-audit status reconciliation (410).
- **Consumer read/query view-model layer (411-419):** the read layer for the three D&D-Beyond screens. Content browse (`querySpells` / `queryMonsters` / `queryItems`), the full character sheet (`buildCharacterSheet`: skills, passives, initiative, speeds, attacks including the unarmed strike, spellcasting, inventory), and the encounter / combat-tracker view model (`buildEncounterView`). The build surfaced + fixed a real bug: structured background skill/tool proficiencies never reached the effect stack (412).
- **SRD ground-truth conformance arc (420-427):** the rule-coverage ledger + trustworthiness-roadmap recalibration (420), then six conformance tests that parse the SRD markdown clone, recompute the rule, and assert the engine matches (AC 421, weapon table 422, spell save DC / attack 423, saving throws 424, background skills 425, species speeds 426) - non-circular verification that caught two real bugs: the pack was missing the martial firearms Musket + Pistol (422) and `createPC` dropped a species' walk speed so a Goliath read 30 not 35 (427 fix, via making `speedFeet` optional + a species-fallback derivation).
- **Docs accuracy system (428-435):** the em-dash sweep of the front-door docs (428), the broken-internal-link fix (431) + the new [doc-links audit](../../docs/changelog/archive-slices-432-433.md) (432), the "doc accuracy: CI-guarded or not stated" norm, a front-door staleness/coverage refresh (433), the doc code-example typecheck audit (434), and the contract-test policy resolution (435). The standing rule now: a precise, drift-prone doc claim is either CI-guarded against its source or not stated as a precise figure.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](../../docs/changelog/) (slices 400-435).

**Slices 434-435**: per-slice detail archived to [docs/changelog/archive-slices-434-435.md](../../docs/changelog/archive-slices-434-435.md) (moved in the alpha.14 release to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the doc code-example typecheck guard (434, the last doc-drift class the link + count guards couldn't reach) and the contract-test policy resolution (435).

**Slices 432-433**: per-slice detail archived to [docs/changelog/archive-slices-432-433.md](../../docs/changelog/archive-slices-432-433.md) (moved in slice 434 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the docs review's prevention half (432, the doc-links audit + the "CI-guarded or not stated" norm) and its cleanup half (433, the front-door accuracy + staleness refresh).

**Slices 428-431**: per-slice detail archived to [docs/changelog/archive-slices-428-431.md](../../docs/changelog/archive-slices-428-431.md) (moved in slice 433 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the em-dash sweep of the ledger + CHANGELOG (428), the slices-426-427 archive (429), the trustworthiness-roadmap "as content grows" note (430), and the broken-internal-link fix (431).

**Slices 426-427**: per-slice detail archived to [docs/changelog/archive-slices-426-427.md](../../docs/changelog/archive-slices-426-427.md) (moved in slice 428 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the ground-truth species-speed conformance test that surfaced a creation gap (426) and the fix for that gap (427).

**Slices 424-425**: per-slice detail archived to [docs/changelog/archive-slices-424-425.md](../../docs/changelog/archive-slices-424-425.md) (moved in slice 426 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: per-class saving-throw proficiency conformance (424) and background skill-proficiency conformance (425).

**Slices 422-423**: per-slice detail archived to [docs/changelog/archive-slices-422-423.md](../../docs/changelog/archive-slices-422-423.md) (moved in slice 424 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the weapon-table conformance that surfaced + closed two missing firearms (422) and the spell save DC / attack conformance (423).

**Slices 420-421**: per-slice detail archived to [docs/changelog/archive-slices-420-421.md](../../docs/changelog/archive-slices-420-421.md) (moved in slice 422 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the SRD rule-coverage ledger + trustworthiness-roadmap recalibration (420) and the first ground-truth derivation upgrade, AC conformance (421).

**Slices 418-419**: per-slice detail archived to [docs/changelog/archive-slices-418-419.md](../../docs/changelog/archive-slices-418-419.md) (moved in slice 420 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet unarmed strike entry that completed the sheet (418) and the encounter / combat-state view model (419).

**Slices 416-417**: per-slice detail archived to [docs/changelog/archive-slices-416-417.md](../../docs/changelog/archive-slices-416-417.md) (moved in slice 418 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet view model's effective speeds + the speed-derivation layering fix (416) and the inventory / equipment summary (417).

**Slices 414-415**: per-slice detail archived to [docs/changelog/archive-slices-414-415.md](../../docs/changelog/archive-slices-414-415.md) (moved in slice 416 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet view model's attacks list (414) and spellcasting block (415).

**Slices 411-413**: per-slice detail archived to [docs/changelog/archive-slices-411-413.md](../../docs/changelog/archive-slices-411-413.md) (moved in slice 414 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the start of the consumer-facing read layer plus the bug it surfaced. Content browse (411), the background skill/tool proficiency-ingestion fix (412), and the character-sheet view model (413).

**Slices 408-410**: per-slice detail archived to [docs/changelog/archive-slices-408-410.md](../../docs/changelog/archive-slices-408-410.md) (moved in slice 411 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the Absorb Elements retrofit + the deliberate Thunder-Step stop (408), the `ContentBundle` single-file user-content shape (409), and the class-audit status-doc reconciliation (410).

**Slices 405-407**: per-slice detail archived to [docs/changelog/archive-slices-405-407.md](../../docs/changelog/archive-slices-405-407.md) (moved in slice 408 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the plugin API design proposal (405), the custom-action seam (406), and the Elemental Weapon retrofit (407).

**Slices 400-403**: per-slice detail archived to [docs/changelog/archive-slices-400-403.md](../../docs/changelog/archive-slices-400-403.md) (moved in slice 404 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the multi-pack id-collision policy + validator (400), and the full SRD/non-SRD content-pack separation (401 backgrounds + feats, 402 the 12 non-SRD spells + their conditions, 403 stop shipping non-SRD content into a gitignored content-packs/ folder).
