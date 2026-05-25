# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content (slice 454): Brown Bear Claw + Mastiff Bite knock-prone-on-hit (L1)**

Two new natural-weapon items reusing the slice-446 size-gated onHit Prone primitive. **Brown Bear Claw** (1d4 slashing, Prone on Large or smaller per SRD 5.2.1 animals.md Brown Bear); **Mastiff Bite** (1d6 piercing, Prone on Medium or smaller per SRD Mastiff). Both wield via the standard natural-weapon pattern: the item carries the dice + onHit rider, the wielder STR + PB produces the RAW attack/damage totals (Brown Bear STR 17 +PB 2 = +5 to hit / 1d4+3 dmg; Mastiff STR 13 +PB 2 = +3 / 1d6+1). Pure content; no engine work.

**Test** at [tests/unit/engine/slice-454-bear-mastiff-prone.test.ts](tests/unit/engine/slice-454-bear-mastiff-prone.test.ts) — 5 cases: Brown Bear Claw on Medium target -> Prone; on Large target -> Prone (gate is Large or smaller); on Huge target -> no Prone; Mastiff Bite on Medium -> Prone; on Large -> no Prone (gate is Medium or smaller).

**Scope notes (corrections to slice 453's queue):** Worg Pack Tactics, Brown/Black Bear Keen Smell, and Blink Dog Keen Hearing/Sight/Smell are 2014 PHB traits that 2024 SRD dropped entirely (verified against SRD 5.2.1 animals.md + monsters-A-Z.md). Spider Climb on Giant Spider + Giant Wolf Spider is already modeled via their fixed `speed.climb` data field (2024 RAW grants fixed climb speeds, not "equal to walk speed"); no trait wire needed. So this slice ends up at 2 monsters' worth of new content rather than the originally-projected ~7.

**Doc updates:** weapons 58 -> 60 in [docs/getting-started.md](docs/getting-started.md) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) (the doc-counts audit also surfaced pre-existing 56 -> 58 drift from slice 449's sprite weapons that hadn't been reconciled; both fixes folded into this slice's update).

**Archive: slices 444-450 moved to [docs/changelog/archive-slices-444-450.md](docs/changelog/archive-slices-444-450.md)** to keep the live CHANGELOG under the 60 KB single-Read ceiling. Live file now carries only the active cycle from slice 451 onward; the L1-arc detail (parts of which slice 454 builds on) is one click away in the archive. Index updated in [docs/changelog/README.md](docs/changelog/README.md).

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 animals.md Brown Bear Claw and Mastiff Bite text verbatim. Same `any` over enumerated Size predicate as slice-446 wolf wires.
- *DRY*: identical shape to wolf-bite / dire-wolf-bite, just different dice + size gate. The 3- and 4-term `any` predicates are still cleaner inline than introducing a `creatureSizeAtMost` shorthand (4 callers now; threshold maybe close, but not yet justified).
- *Mechanical outcomes asserted*: per-size gate fires the expected ConditionApplied (or doesn't), per-weapon; hit prerequisite enforced (no prone on a miss).

**Open follow-ups:**
- Other prone-on-hit users in the SRD pack — Boar Gore (Medium or smaller + 20+ ft straight movement), Allosaurus Claws (Large or smaller + 30+ ft straight movement) — both gated on movement-derived facts the engine doesn't carry. Ankylosaurus Tail (Huge or smaller, unconditional) is also similar but Ankylosaurus isn't in the pack. *Still open.*
- The `creatureSizeAtMost` shorthand predicate would compress these 3- and 4-term `any` chains; 4 canonical users (Wolf, Dire Wolf, Brown Bear, Mastiff) but still inline-readable. Re-evaluate when a 5th lands. *Still open.*

**Engine + content (slice 453): Orc Adrenaline Rush species trait - L1 playability arc**

Closes slice-448's deferred Adrenaline Rush row. RAW (SRD 5.2.1 character-origins.md L317): "Dash as a Bonus Action; you gain Temp HP equal to your PB." At-will. (Scope note: the queue's "Orc Aggressive" was a 2014 monster trait; 2024 SRD has no Orc monster, and the species's bonus-action trait is Adrenaline Rush. Gnoll Rampage is a different shape, future slice.)

New planner [src/engine/plan/adrenaline-rush.ts](src/engine/plan/adrenaline-rush.ts) modeled on `planStepOfTheWind`: validates Orc species + active combatant + bonus available + not already dashed; emits `ActionEconomyConsumed(bonusAction)`, `Dashed`, `TempHPGranted(amount = proficiencyBonus(computeTotalLevel))`. Reuses the existing `Dashed` event so dashed-this-turn book-keeping layers in unchanged. Wired across the 4 standard sites; slice-364 planner-wiring audit verified green. Orc species in pack gains a `Custom { handlerId: 'adrenaline-rush' }` marker (discoverable signal; the planner reads species id directly).

Test at [tests/unit/engine/slice-453-adrenaline-rush.test.ts](tests/unit/engine/slice-453-adrenaline-rush.test.ts) — 4 cases: Orc L1 (PB 2 -> TempHP 2), Orc L5 (PB 3 -> TempHP 3), Human rejected, bonus-already-used rejected.

Audit: RAW match exactly; names mirror Step of the Wind; declined a "GrantBonusActionVariantOfAction" effect-kind abstraction (only 2 callers; below threshold); single at-threading; mechanical chain + PB scaling + species + economy gates all asserted. Open follow-ups: Gnoll Rampage (Bloodied predicate + damage-trigger bonus-action attack); other slice-448-deferred species traits.

**Content (slice 452): Sunlight Sensitivity / Weakness sweep across 4 SRD Undead - L1 playability arc**

Pure content sweep using the slice-451 primitive. RAW (SRD 5.2.1) gives four pack monsters a sunlight-gated disadvantage that previously shipped as `traits: []`:

| Monster | CR | RAW name | Wired this slice |
|---|---|---|---|
| Specter | 1 | Sunlight Sensitivity | attack-disadvantage + check-disadvantage (full RAW) |
| Wight | 3 | Sunlight Sensitivity | attack-disadvantage + check-disadvantage (full RAW) |
| Wraith | 5 | Sunlight Sensitivity | attack-disadvantage + check-disadvantage (full RAW) |
| Shadow | 1/2 | Sunlight Weakness | attack-disadvantage + check-disadvantage (partial; saves arm deferred) |

Each monster's `traits` array in [src/content/packs/starter-pack.json](src/content/packs/starter-pack.json) gains two `SetAdvantage` entries (one `on: 'attack'`, one `on: { kind: 'check' }`) gated on `bearer.lightLevel == 'bright'`. Identical shape to Kobold Warrior's slice-451 wiring.

**Shadow's Sunlight Weakness saves-arm deferral:** SRD says "Disadvantage on D20 Tests" — which in 2024 includes saving throws as well as attack rolls and ability checks. This slice wires the attack + check arms (which use the existing `bearer.lightLevel` fact on `AttackIntent` and `ComputeAbilityCheckInput`); the saves arm would need `lightLevel` threaded through `ComputeSaveInput` too. That's a small symmetric engine extension but it would also need to thread through every planner that calls `computeSavingThrow` (cast-spell, recurring-save, stunning-strike, transformations, movement, etc.), so it's a slice of its own. Documented as Open follow-up below.

**Test** at [tests/unit/engine/slice-452-sunlight-sweep.test.ts](tests/unit/engine/slice-452-sunlight-sweep.test.ts) — 8 cases (4 monsters × {bright -> disadvantage, dim -> none}). Parametrized over the monster ids so adding a 5th sunlight-sensitive creature in a future slice extends the matrix by 2 lines.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md Specter / Wight / Wraith / Shadow Sunlight-Sensitivity / Weakness lines verbatim for the attack + check arms; Shadow's saves arm documented as deferred (not wired here).
- *DRY*: identical 2-entry pattern across 4 monsters; declined to extract a "sunlight-sensitive" trait template — the shape is small enough that inline duplication beats a content-side template indirection (there are no other shared dimensions, and adding a 5th user later costs the same 2 lines).
- *Mechanical outcomes asserted*: parametrized over all 4 monsters; bright -> disadvantage, dim -> none. Cross-monster confirms the slice-451 primitive doesn't accidentally couple to Kobold-specific state.

**Open follow-ups:**
- **Shadow's Sunlight Weakness saves arm** (closing slice 452 partial): thread `lightLevel?: 'bright' | 'dim' | 'darkness'` through `ComputeSaveInput` mirror-fashion (slice 279's check-side, slice 451's attack-side), and through every planner that calls `computeSavingThrow`. Wire a third `SetAdvantage on: { kind: 'save' }` arm on Shadow. *Still open.*
- Other Undead Sunlight users still in scope but not in the SRD pack (Vampire Spawn's Sunlight Hypersensitivity is a damage shape, not a disadvantage shape — different primitive needed). *Still open.*

~~Open follow-up from slice 451: **Other Sunlight Sensitivity / Sunlight Weakness users:** Shadow (CR 1/2), Wight (CR 3), Wraith (CR 5), Specter (CR 1).~~ **Closed by slice 452** (Shadow's saves arm reopened above as a narrower follow-up).

**Engine + content (slice 451): Sunlight Sensitivity on Kobold Warrior - L1 playability arc**

Completes the Kobold Warrior's RAW combat profile (Pack Tactics from slice 445 + Sunlight Sensitivity now). RAW (SRD 5.2.1 Kobold Warrior): "While in sunlight, the kobold has Disadvantage on ability checks and attack rolls." Slice 451 closes both arms by **extending slice 279's existing `bearer.lightLevel` consumer-coordinated fact** from the check-only intent (`ComputeAbilityCheckInput`) to the attack-side intents (`AttackIntent` + `ResolveAttackInput`); the check arm reuses slice 279 unchanged. The attack arm uses the same fact name + same opt-in semantic, so a consumer that already populates `lightLevel` on one intent populates the same value on the other.

**Engine** (small, mirrors the slice-279 shape):
- New `lightLevel?: 'bright' | 'dim' | 'darkness'` field on `AttackIntent` and `ResolveAttackInput` in [src/engine/plan/attack.ts](src/engine/plan/attack.ts). Optional; `undefined` produces no Sunlight Sensitivity disadvantage (opt-in default, matching slice 279).
- Threaded into `attackerSelfAdvantageFacts` as `bearer.lightLevel` so attacker-side `SetAdvantage` entries can gate on it. Same fact-name namespace the existing slice-279 check-side path uses, so trait predicates are identical between the two paths.
- Threaded from `AttackIntent` to `ResolveAttackInput` in the `planAttack -> resolveAttack` call site.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): kobold-warrior's traits array gains two entries alongside the existing Pack Tactics:
- `SetAdvantage on:'attack' mode:'disadvantage' condition: eq bearer.lightLevel 'bright'`
- `SetAdvantage on:{kind:'check'} mode:'disadvantage' condition: eq bearer.lightLevel 'bright'`

**Test** at [tests/unit/engine/slice-451-sunlight-sensitivity.test.ts](tests/unit/engine/slice-451-sunlight-sensitivity.test.ts) — 5 cases:
- Kobold attack with `lightLevel: 'bright'` -> `used: 'disadvantage'`, 2× d20.
- Kobold attack with `lightLevel: 'dim'` -> `used: 'none'`.
- Kobold attack with `lightLevel: 'darkness'` -> `used: 'none'`.
- Kobold attack with `lightLevel` omitted -> `used: 'none'` (opt-in default).
- Kobold ability check in `'bright'` light has disadvantage; in `'dim'` does not (re-confirms the slice-279 check-side arm still works for the kobold's check-disadvantage arm using the same `bearer.lightLevel` fact).

**Catalog updates:** the consumer-coordinated fact slots row for `lightLevel` in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) now lists both check-side and attack-side entry points. Added a `Sunlight Sensitivity never fires (opt-in)` line to the until-consumer-wires-it section.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md Kobold Warrior Sunlight Sensitivity exactly. The dim/darkness/undefined cases all correctly produce no disadvantage (the predicate is `eq 'bright'`, no other value matches).
- *Names*: `lightLevel` matches the existing slice-279 field name exactly. The fact-name `bearer.lightLevel` is consistent across both intent types.
- *DRY*: declined to introduce a separate "attack-side lightLevel" fact name; reused the slice-279 namespace so content gates on one canonical name regardless of whether it's a check or an attack.
- *SRP*: the change is mechanical-only (one field, one map entry, one passthrough). The Sunlight Sensitivity trait is pure content; the engine doesn't get a "sunlight-sensitive" concept of its own.
- *Mechanical outcomes asserted*: per-light-value gate fires correctly (`bright` -> disadvantage; everything else -> none) for both arms. The Pack Tactics trait on the same monster still works (cross-effect non-interference confirmed by the still-green slice-445 test).

**Open follow-ups:**
- ~~**Other Sunlight Sensitivity / Sunlight Weakness users:** Shadow (CR 1/2), Wight (CR 3), Wraith (CR 5), Specter (CR 1). All canonical 2024 candidates. Shadow + Specter are L1-encounter monsters. Same primitive shape, just content sweeps.~~ **Closed by slice 452** (Specter / Wight / Wraith fully; Shadow's attack + check arms; saves arm tracked as a narrower follow-up).
- **Population from a "sun is up" boolean** on the consumer's encounter would let the consumer set `lightLevel: 'bright'` once on a per-encounter basis rather than per-intent; that's a consumer concern (the engine doesn't model time-of-day). *Still open* as a future consumer ergonomics note.

*Slice detail for slices 444-450 (the L1 playability arc, part 1: Divine Smite, Pack Tactics, Wolf knock-prone, species sweep 1+2, Sprite + Thieves' Cant, noAbilityModifierDamage flag) moved to [docs/changelog/archive-slices-444-450.md](docs/changelog/archive-slices-444-450.md) in slice 454 to fit the live CHANGELOG under the 60 KB single-Read ceiling. Slices 451-454 remain inline above.*

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
