# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 464): monster Multiattack content declaration - the deferred-since-slice-462 primitive lands**

The `planMultiattack` planner has been in the engine since slice 13 (Ogre with two Greatclub swings, the s13-creature golden) and works fine — the gap was always content-side: statblocks couldn't *declare* their Multiattack pattern, so consumers had to read RAW by hand and hand-author the runtime `multiattack` field. This slice closes that gap and ships the Ghoul's "two Bites" as the canonical user.

**New content field** `MonsterStatblockSchema.multiattack` ([src/schemas/content/monster.ts:64](src/schemas/content/monster.ts#L64)) of shape `{ name, attacks: [{ weaponId, count }] }`. `weaponId` references the item DEFINITION id (e.g. `"ghoul-bite"`) — content cannot know which instance ids a consumer will mint. The runtime `MultiattackPattern` on `Character` continues to use `weaponInstanceId` (unchanged since slice 13).

**New derive helper** `runtimeMultiattackFromStatblock(declared, weaponIdToInstance)` ([src/derive/multiattack.ts](src/derive/multiattack.ts)) bridges the two: consumers mint one item instance per referenced weaponId, pass a `Record<weaponId, instanceId>` map, and get back the runtime pattern ready to drop into `Character.multiattack`. Throws with a precise error naming the missing weapon when the map is incomplete. Exported from [src/index.ts](src/index.ts) + [src/derive/index.ts](src/derive/index.ts) + as `MonsterMultiattackSchema` from [src/schemas/content/index.ts](src/schemas/content/index.ts).

**Canonical user (Ghoul)**: RAW (SRD 5.2.1 Ghoul): "Multiattack. The ghoul makes two Bite attacks." Wired as `"multiattack": { "name": "Ghoul Multiattack", "attacks": [{ "weaponId": "ghoul-bite", "count": 2 }] }` on the Ghoul statblock. Closes the deferred follow-up from slice 462 ("Ghoul Multiattack stays deferred until the monster-Multiattack primitive ships").

**Test** at [tests/unit/engine/slice-464-monster-multiattack.test.ts](tests/unit/engine/slice-464-monster-multiattack.test.ts) — 4 cases: Ghoul statblock declares the expected pattern; helper maps weaponId → instanceId correctly; helper throws on missing instance; end-to-end (load pack → mint ghoul-bite → build runtime pattern via helper → set on Character → `engine.plan.multiattack` → exactly 2 `AttackRolled` events).

**Contract snapshot updated** intentionally for two new public exports: `runtimeMultiattackFromStatblock` + `MonsterMultiattackSchema`.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Ghoul Multiattack exactly. The "two Bite attacks" pattern is data; the planner already threads state between swings (slice 392) so a prone-on-first-bite would apply to the second swing's resolution.
- *Names*: `MonsterMultiattack` mirrors `MultiattackPattern` (the runtime type, slice 13). `weaponId` vs `weaponInstanceId` distinguishes content (definition) from runtime (instance), matching the rest of the codebase's definition/instance vocabulary.
- *DRY*: helper is 15 lines, single caller-shape, but lives on the derive seam because it's a pure transformation from content → runtime — same seam as `computeAC`, `computeSpellSaveDC`, etc. Consumers who want bespoke shapes (mixed weapons across instances, custom names) still build the runtime pattern by hand.
- *SRP*: the content schema declares; the helper transforms; the planner consumes. Three concerns, three files.
- *Magic numbers*: none introduced. Count is content-driven.
- *at-threading*: not applicable (no events emitted by the helper).
- *Mechanical outcomes asserted*: presence on the loaded pack; helper output shape; helper error message; end-to-end attack count.

**Open follow-ups:**
- **Brown Bear Multiattack** (one Bite + two Claws): blocked on the Brown Bear Bite natural weapon not yet existing in the pack (only Brown Bear Claw was wired in slice 454). One-line content add for the Bite + multiattack declaration. *Still open.*
- **Bulette / Bandit / Centaur / etc. Multiattacks**: the same content-declaration pattern applies wholesale to every CR ≥ 1 monster with a Multiattack action. Each is a small content slice now that the schema field exists. *Still open.*
- **Dragon-style "X Rend attacks OR Spellcasting" Multiattacks** (SRD 5.2.1, e.g. Adult Black Dragon): the RAW has "It can replace one attack with a use of Spellcasting." The schema's per-entry `weaponId + count` doesn't model "swap one attack for a cast." A future extension (`alternates: [{ replaces: weaponId, with: spellId }]` per swing) could capture it. *Still open.*

**Engine + content (slice 463): Cleric Channel Divinity - Turn Undead (L2 caster playability)**

The iconic Cleric action. RAW (SRD 5.2.1 Cleric L2): "As a Magic action, you present your Holy Symbol and censure Undead creatures. Each Undead of your choice within 30 feet of you must make a Wisdom saving throw. If the creature fails its save, it has the Frightened and Incapacitated conditions for 1 minute. ... This effect ends early on the creature if it takes any damage, if you have the Incapacitated condition, or if you die."

Scope note: Channel Divinity arrives at Cleric L2 (not L1), but Turn Undead is the foundational Cleric mechanic for low-level play — and a clean retro-fit against Zombie's slice-456 Undead Fortitude / the slice-452 Sunlight Sweep undead.

**New planner** [src/engine/plan/turn-undead.ts](src/engine/plan/turn-undead.ts) modeled on `planIntimidatingPresence`: validates Cleric L2+ + Channel Divinity resource ≥ 1 + (if in encounter as active combatant) action available. Computes spell save DC via the existing `computeSpellSaveDC` derive (8 + WIS + PB for clerics). Emits `ActionEconomyConsumed(action)` (when in encounter) + `ResourceSpent(channel-divinity, 1)`, then per-target: `SaveRolled(WIS vs DC)` and on failure two `ConditionApplied` events (`frightened` + `incapacitated`, both with `endsOnDamage: true` so the slice-391 chokepoint scrubs both arms on any damage). Non-Undead targets are silently skipped (RAW limits the censure to Undead; mixed lists shouldn't fail the whole action). Wired across the 4 standard sites; slice-364 planner-wiring audit verified green.

**Content:** Cleric L2 gains a new `turn-undead` feature row with `Custom { handlerId: 'turn-undead' }` marker, sibling to the existing `channel-divinity` (GrantResource) + `divine-spark` (still stub) features.

**Test** at [tests/unit/engine/slice-463-turn-undead.test.ts](tests/unit/engine/slice-463-turn-undead.test.ts) — 5 cases: L2 Cleric vs Zombie rolls WIS save at DC 13 (8 + WIS 16 +3 + PB 2), on failure applies Frightened + Incapacitated both with `endsOnDamage: true`; L1 cleric rejected; depleted Channel Divinity rejected; non-Undead target silently skipped (no SaveRolled for them, resource still consumed); non-Cleric rejected.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Cleric L2 Channel Divinity / Turn Undead text exactly for the engine-modelable arms. Both Frightened + Incapacitated arms applied; `endsOnDamage` flag covers the "ends early on damage" RAW arm. The "Cleric incapacitated / dying ends the effect" and 30-ft range stay consumer-managed (source-state-dependent / positional).
- *Names*: `planTurnUndead` / `TurnUndeadIntent` mirror existing planner conventions. Resource id `channel-divinity` matches the existing L2 GrantResource grant.
- *DRY*: per-target shape mirrors `planIntimidatingPresence` exactly (both are "AoE save → frightened-on-fail" planners). Declined to extract a shared `applySaveAoEFrightener` helper — second caller of the same shape, still below the abstraction threshold.
- *SRP*: a single planner handles the full Turn Undead chain (validate → spend → save-per-target → apply-conditions). Sear Undead (L5 radiant-damage add-on) stays its own future slice; it'd extend this planner with a per-failed-save damage roll.
- *at-threading*: single `nowIso()` resolution shared across all emitted events.
- *Mechanical outcomes asserted*: DC computed from cleric's WIS + PB; save rolled per target; conditions applied with endsOnDamage; non-Undead silently skipped; resource gating; class-level gating.

**Open follow-ups:**
- **Cleric L5 Sear Undead** (`sear-undead` still ships `effects: []`): adds NdN d8 radiant damage (N = WIS mod, min 1d8) per Undead that fails the save. Extends this planner. *Still open.*
- **Cleric L2 Divine Spark** (`divine-spark` still ships `effects: []`): the other Channel Divinity option — heal-or-deal-damage-as-Bonus-Action. Separate Channel Divinity option planner. *Still open.*
- **Channel Divinity option dispatch**: the engine doesn't yet model "Channel Divinity → choose-an-option-at-activation-time" first-class; consumers route to the specific planner (`turnUndead`, future `divineSpark`). A future `planChannelDivinity({ option: ... })` dispatcher could unify them. *Still open.*

**Content (slice 462): Ghoul Bite natural weapon - L1 playability arc**

The Ghoul's Claw (paralysis-on-CON-fail) was already wired in slice 319, but the Ghoul also has a Bite attack in 2024 RAW that wasn't in the pack. RAW (SRD 5.2.1 Ghoul): "Bite. Hit: 5 (1d6 + 2) Piercing damage plus 3 (1d6) Necrotic damage." New `ghoul-bite` natural-weapon item: primary 1d6 piercing + slice-316 unconditional onHit extra-damage rider for the 1d6 necrotic arm (same shape as wyvern-sting's poison rider). The +2 damage / +4 attack come from the wielder's STR + PB, not the weapon.

The Ghoul's signature paralysis mechanic (Claw -> CON DC 10 save -> Paralyzed, gated `not(Undead or elf)`) already works via the slice-319 `ghoul-claws` item, so the Ghoul monster's most distinctive RAW behavior is wired end-to-end. **Multiattack** (two Bites per Attack action) stays deferred until the monster-Multiattack primitive ships; consumers can still simulate it by making two ghoul-bite attacks in the same turn.

**Test** at [tests/unit/engine/slice-462-ghoul-bite.test.ts](tests/unit/engine/slice-462-ghoul-bite.test.ts) — 1 case (seed-searched for a hit): on a hit, the DamageRolled event carries both a piercing primary roll and a necrotic rider roll.

**Doc updates:** weapons 60 -> 61 in [docs/getting-started.md](docs/getting-started.md) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Ghoul Bite text exactly. Same onHit-rider pattern as the slice-322 poison-natural-weapons sweep.
- *DRY*: identical shape to wyvern-sting; no new primitive.

**Open follow-ups:**
- **Monster Multiattack primitive**: same deferred shape that blocks dozens of other monster statblocks (Brown Bear, Wolf, Bandit Captain, etc.). When it lands, the Ghoul gets its 2-Bite Multiattack and most CR ≤ 1 monsters with Multiattack become fully RAW. *Still open.*

**Content (slice 461): Human Skillful species trait - L1 playability arc**

Wires the simplest of the Human species's three traits. RAW (SRD 5.2.1 Human): "Skillful. You gain proficiency in one skill of your choice." Modeled as `OfferChoice oneOf:1 when:'onAcquire'` over the 18 skills (each option grants the matching `GrantProficiency target:'skill' level:'proficient'`), mirroring slice-447's Elf Keen Senses pattern. Pure content slice; no engine work.

**Test** at [tests/unit/engine/slice-461-human-skillful.test.ts](tests/unit/engine/slice-461-human-skillful.test.ts) — 3 cases: a Human who picks Perception gets it on the effect stack; another who picks Stealth gets Stealth (not Perception); a Human without a resolved choice has neither.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Human Skillful exactly. All 18 skills offered.
- *Names*: `choiceId: 'human-skillful'` matches the trait name. Option ids match the canonical skill ids (Wizard Scholar / Rogue Expertise / Elf Keen Senses conventions).
- *DRY*: 18-option OfferChoice is verbose but mirrors slice-55 Wizard Scholar + slice-60 Rogue Expertise patterns. Declined to introduce a content-side "AllSkillsChoice" template — only 2 callers now (Skillful + Skilled feat), still inline-readable.

**Open follow-ups:**
- **Human Resourceful**: "You gain Heroic Inspiration whenever you finish a Long Rest." Engine doesn't carry Heroic Inspiration as a tracked resource; closing this needs a new resource shape + a reroll mechanic that consumes it. *Still open.*
- **Human Versatile**: "You gain an Origin feat of your choice." Needs a "grant feat from choice" resolution path — feats are typically chosen at character creation and recorded in `featsTaken`, not granted via OfferChoice option effects. A `Custom { handlerId: 'versatile-origin-feat' }` marker would close the discoverability gap but defer the structural work. *Still open.*

**Docs (slice 460): archive slices 451-459 (L1 playability arc, part 2) to free CHANGELOG headroom**

Pure CHANGELOG-archive operation. The live CHANGELOG had reached ~53 KB / 60 KB ceiling after slices 451-459. Moved that nine-slice cohort to a new sibling archive file at [docs/changelog/archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md), continuing from [docs/changelog/archive-slices-444-450.md](docs/changelog/archive-slices-444-450.md) (L1 arc part 1). Live CHANGELOG drops from ~53 KB to ~19 KB; archive holds the full per-slice detail with sibling-rooted links (`../../src/...`, `archive-slices-444-450.md`). Index in [docs/changelog/README.md](docs/changelog/README.md) updated. The split-treadmill stays at bay: the active CHANGELOG holds the alpha.14 cycle + the 1-slice docs entry (443) + this archive note; future slices accumulate against a near-empty live file.

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

## 0.1.0-alpha.14 - 2026-05-22

**Release (slice 436): bump to 0.1.0-alpha.14**

Promotes the post-alpha.13 cohort (slices 400-435) to a tagged release. `package.json` bumped from `0.1.0-alpha.13` to `0.1.0-alpha.14`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the cohort's only persisted-shape touch is `Character.speedFeet` becoming optional (slice 427, was `.default(30)`), and old saves carry the field so they parse unchanged. The full suite is green at 346 files / 2325 passing; `npm run ci` clean (typecheck + coverage + build).

The headline new surface is the **consumer read/query view-model layer**, the first public API beyond the engine core: new exports `querySpells` / `queryMonsters` / `queryItems`, `buildCharacterSheet`, `buildEncounterView`, plus the standalone derivations `computeWeaponDamage` / `computeUnarmedStrike` / `getEffectiveSpeed` / `getEffectiveSpeeds`. Cohort, in five arcs:

- **SRD / non-SRD content separation + multi-pack policy (400-403):** the multi-pack id-collision policy + report-all validator (400), then the full split of non-SRD content out of the drift-audited starter pack (401 backgrounds + feats, 402 the 12 non-SRD spells + their conditions to `phb-2024-extras`, 403 stop shipping non-SRD content from a gitignored `content-packs/` folder).
- **Plugin / custom-action seam + effect retrofits (405-410):** the plugin API design proposal (405) and the `Custom`-action plan seam (406); the Elemental Weapon (407) and Absorb Elements (408) retrofits onto the new primitives (with a deliberate Thunder-Step stop); the `ContentBundle` single-file user-content shape (409); and a class-audit status reconciliation (410).
- **Consumer read/query view-model layer (411-419):** the read layer for the three D&D-Beyond screens. Content browse (`querySpells` / `queryMonsters` / `queryItems`), the full character sheet (`buildCharacterSheet`: skills, passives, initiative, speeds, attacks including the unarmed strike, spellcasting, inventory), and the encounter / combat-tracker view model (`buildEncounterView`). The build surfaced + fixed a real bug: structured background skill/tool proficiencies never reached the effect stack (412).
- **SRD ground-truth conformance arc (420-427):** the rule-coverage ledger + trustworthiness-roadmap recalibration (420), then six conformance tests that parse the SRD markdown clone, recompute the rule, and assert the engine matches (AC 421, weapon table 422, spell save DC / attack 423, saving throws 424, background skills 425, species speeds 426) - non-circular verification that caught two real bugs: the pack was missing the martial firearms Musket + Pistol (422) and `createPC` dropped a species' walk speed so a Goliath read 30 not 35 (427 fix, via making `speedFeet` optional + a species-fallback derivation).
- **Docs accuracy system (428-435):** the em-dash sweep of the front-door docs (428), the broken-internal-link fix (431) + the new [doc-links audit](docs/changelog/archive-slices-432-433.md) (432), the "doc accuracy: CI-guarded or not stated" norm, a front-door staleness/coverage refresh (433), the doc code-example typecheck audit (434), and the contract-test policy resolution (435). The standing rule now: a precise, drift-prone doc claim is either CI-guarded against its source or not stated as a precise figure.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](docs/changelog/) (slices 400-435).

**Slices 434-435**: per-slice detail archived to [docs/changelog/archive-slices-434-435.md](docs/changelog/archive-slices-434-435.md) (moved in the alpha.14 release to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the doc code-example typecheck guard (434, the last doc-drift class the link + count guards couldn't reach) and the contract-test policy resolution (435).

**Slices 432-433**: per-slice detail archived to [docs/changelog/archive-slices-432-433.md](docs/changelog/archive-slices-432-433.md) (moved in slice 434 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the docs review's prevention half (432, the doc-links audit + the "CI-guarded or not stated" norm) and its cleanup half (433, the front-door accuracy + staleness refresh).

**Slices 428-431**: per-slice detail archived to [docs/changelog/archive-slices-428-431.md](docs/changelog/archive-slices-428-431.md) (moved in slice 433 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the em-dash sweep of the ledger + CHANGELOG (428), the slices-426-427 archive (429), the trustworthiness-roadmap "as content grows" note (430), and the broken-internal-link fix (431).

**Slices 426-427**: per-slice detail archived to [docs/changelog/archive-slices-426-427.md](docs/changelog/archive-slices-426-427.md) (moved in slice 428 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the ground-truth species-speed conformance test that surfaced a creation gap (426) and the fix for that gap (427).

**Slices 424-425**: per-slice detail archived to [docs/changelog/archive-slices-424-425.md](docs/changelog/archive-slices-424-425.md) (moved in slice 426 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: per-class saving-throw proficiency conformance (424) and background skill-proficiency conformance (425).

**Slices 422-423**: per-slice detail archived to [docs/changelog/archive-slices-422-423.md](docs/changelog/archive-slices-422-423.md) (moved in slice 424 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the weapon-table conformance that surfaced + closed two missing firearms (422) and the spell save DC / attack conformance (423).

**Slices 420-421**: per-slice detail archived to [docs/changelog/archive-slices-420-421.md](docs/changelog/archive-slices-420-421.md) (moved in slice 422 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the SRD rule-coverage ledger + trustworthiness-roadmap recalibration (420) and the first ground-truth derivation upgrade, AC conformance (421).

**Slices 418-419**: per-slice detail archived to [docs/changelog/archive-slices-418-419.md](docs/changelog/archive-slices-418-419.md) (moved in slice 420 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet unarmed strike entry that completed the sheet (418) and the encounter / combat-state view model (419).

**Slices 416-417**: per-slice detail archived to [docs/changelog/archive-slices-416-417.md](docs/changelog/archive-slices-416-417.md) (moved in slice 418 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet view model's effective speeds + the speed-derivation layering fix (416) and the inventory / equipment summary (417).

**Slices 414-415**: per-slice detail archived to [docs/changelog/archive-slices-414-415.md](docs/changelog/archive-slices-414-415.md) (moved in slice 416 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet view model's attacks list (414) and spellcasting block (415).

**Slices 411-413**: per-slice detail archived to [docs/changelog/archive-slices-411-413.md](docs/changelog/archive-slices-411-413.md) (moved in slice 414 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the start of the consumer-facing read layer plus the bug it surfaced. Content browse (411), the background skill/tool proficiency-ingestion fix (412), and the character-sheet view model (413).

**Slices 408-410**: per-slice detail archived to [docs/changelog/archive-slices-408-410.md](docs/changelog/archive-slices-408-410.md) (moved in slice 411 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the Absorb Elements retrofit + the deliberate Thunder-Step stop (408), the `ContentBundle` single-file user-content shape (409), and the class-audit status-doc reconciliation (410).

**Slices 405-407**: per-slice detail archived to [docs/changelog/archive-slices-405-407.md](docs/changelog/archive-slices-405-407.md) (moved in slice 408 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the plugin API design proposal (405), the custom-action seam (406), and the Elemental Weapon retrofit (407).

**Slices 400-403**: per-slice detail archived to [docs/changelog/archive-slices-400-403.md](docs/changelog/archive-slices-400-403.md) (moved in slice 404 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the multi-pack id-collision policy + validator (400), and the full SRD/non-SRD content-pack separation (401 backgrounds + feats, 402 the 12 non-SRD spells + their conditions, 403 stop shipping non-SRD content into a gitignored content-packs/ folder).

## Older releases

Tagged releases `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
