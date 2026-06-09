# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

Per-slice detail lives in [docs/changelog/slice-NNN.md](docs/changelog/) — the live file below carries only a compact pointer per slice (one headline + one-sentence summary) so the file stays bounded regardless of project age. Convention adopted in slice 628.

## Unreleased

**Feat (slice 771): actionTargets query — target enumeration for creature-target actions**
The `bonusActionTargets` sibling for the Action menu. New `engine.query.actionTargets(state, encounterId, combatantId, optionId)` → `{ combatantId, position? }[]` for Grapple / Shove (5 ft) / Help (no range filter — consumer-managed) / Divine Spark (30 ft, self + the dying for heal mode). The shared enumerator was factored into `src/query/_targeting.ts` (`creatureTargetsInReach`, `CreatureTargeting` with optional `rangeFeet`); `bonusActionTargets` refactored to delegate to it (behavior unchanged). Additive query surface.
Detail: [slice-771.md](docs/changelog/slice-771.md).

**Fix (slice 770): encounter-view surfaces hp.maxBonus**
The last unfixed finding from the affordance-correctness sweep. `buildEncounterView`'s `CombatantView.hp` reported `{ current, max, temp }` from the raw `hp.max`, omitting `hp.maxBonus` — so a combatant under a max-HP buff (Aid) showed the unbuffed maximum and a tracker couldn't reconcile `current > max`. `hp` now carries `maxBonus` (displayed max = `max + maxBonus`). Additive read-model field.
Detail: [slice-770.md](docs/changelog/slice-770.md).

**Feat (slice 769): action affordances — class-feature actions (Action Surge / Divine Spark / Turn Undead)**
Completes the deferred affordance program. `actionOptions` grows the `bonusActions` shape — per-descriptor `owns` + `resourceId` (`no-uses` gate) + `costsAction` — and `ActionParams`/`UseActionOptionOptions` gain `targetIds`. Action Surge (Fighter, `action-surge`, `costsAction:false` → stays enabled after the action is used, matching its "grants an extra action" economy); Divine Spark (Cleric Channel Divinity, creature + `mode`); Turn Undead (Channel Divinity, `targetIds`). All already dispatched, so `useActionOption` routes them unchanged. Each verified planner-faithful by dispatch. Also evicted the 0.3.0-alpha.0 release narrative to [released-versions-0.3.0-alpha.0.md](docs/changelog/released-versions-0.3.0-alpha.0.md) (doc-size discipline; CHANGELOG ~60 KB → ~25 KB).
Detail: [slice-769.md](docs/changelog/slice-769.md).

**Feat (slice 768): bonus-action registry — Cloud's Jaunt + Conjure Pact Weapon**
Wires the remaining bonus-action deferrals. `BonusActionParams` (+ `useOption`'s `UseOptionOptions`) gains `to?: Position` and `weaponDefinitionId?: string`; the descriptor gains a `requires` list (`bonusActionIntent` throws on a missing one). Cloud's Jaunt (`target:'none'`, `requires:['to']`): `owns` = the resolved Cloud's Jaunt Giant Ancestry, `resourceId: giant-ancestry`. Conjure Pact Weapon (`requires:['weaponDefinitionId']`): `owns` = `buildEffectStack(...).hasPactBlade()`. Both already dispatched, so `useOption` routes them unchanged. Paladin's Smite needs no entry — `divine-smite` is already a Bonus Action spell in `castableSpells` (the post-hit Paladin's Smite *feature* is a rider); Metamagic stays excluded (spell-cast modifier).
Detail: [slice-768.md](docs/changelog/slice-768.md).

**Feat (slice 767): reaction affordances — Deflect Attacks + Countercharm (cross-event correlation)**
Completes the reaction layer. `reactionsForTrigger` gains an optional `recentEvents` param (the consumer's log slice) for cross-event correlation — additive, every other reaction ignores it. Deflect Attacks (damage trigger, Monk L3): correlates when the reactor is the damaged target with deflectable physical damage, scanning `recentEvents` for the triggering `AttackRolled`. Countercharm (new `condition-applied` trigger → `ConditionApplied`, Bard L7): correlates a Charmed/Frightened `ConditionApplied`, scanning `recentEvents` for the preceding failed `SaveRolled` to fill the reroll's DC/ability/bonus (30 ft consumer-managed; the consumer removes the condition on a successful reroll). Both verified by dispatch. The reaction-affordance layer is now complete (9 reactions across 5 trigger kinds).
Detail: [slice-767.md](docs/changelog/slice-767.md).

**Feat (slice 766): reaction affordances — Opportunity Attack (leaves-reach trigger)**
Wires the last positionally-triggered deferred reaction. New `ReactionTriggerKind` `'leaves-reach'` → `CombatantMoved`. OA's `owns` = the reactor wields a main-hand melee weapon; correlate fires when the mover (≠ reactor) was within the reactor's melee reach at `fromPosition` and beyond it at `toPosition` (chebyshev; 5 ft, +5 for a `reach` weapon), the reactor isn't the active combatant. `planOpportunityAttack` uses `resolveAttack` directly (no range gate), so an attack on a creature that just left reach is accepted — planner-faithful. Verified by dispatching the intent.
Detail: [slice-766.md](docs/changelog/slice-766.md).

**Feat (slice 765): reaction affordances — Stone's Endurance + Protection**
Wires two reactions slice 763 deferred, now planner-faithful. Stone's Endurance: `owns` gates on the RESOLVED Giant Ancestry (`findGoliathAncestryChoice === 'stones-endurance'`), not just species + resource — so a Goliath who didn't pick it is no longer wrongly offered it (damage trigger). Protection: `owns` = shield + `hasProtectionFightingStyle` (the effect stack), correlated from an `AttackRolled` on an ally within 5 ft (chebyshev; positionless → not offered) → `{ protectorId, attackerId, triggeringAttackEventId }`. Registry `owns`/`correlate` widened to receive state/content/encounterId. Each correlated intent verified against its planner. Still deferred: Deflect Attacks + Countercharm (cross-event context) and Opportunity Attack (positional move trigger).
Detail: [slice-765.md](docs/changelog/slice-765.md).

**Feat (slice 764): general action affordances (G2) — registry-driven `actionOptions`**
Closes the last completeness gap: `availableActions` was hardcoded to the 5 core combat intents, so the general SRD 2024 actions were drivable but undiscoverable. New `engine.query.actionOptions(state, encounterId, combatantId)` → `{ id, label, target, enabled, reason? }[]` enumerating Search / Study / Influence / Utilize / Hide / Grapple / Shove / Help / Ready (the registry-driven sibling of `availableActions`), plus `actionIntent(optionId, combatantId, params)` (id → intent builder) and `engine.plan.useActionOption(state, { combatantId, optionId, ...params })` (the `useOption` sibling — builds + routes via `planIntent`). All gate uniformly on `not-your-turn` / `action-used` / blocking conditions. Deferred: class-feature actions (Action Surge's inverted economy; Turn Undead / Divine Spark resource + multi-target). Additive query surface.
Detail: [slice-764.md](docs/changelog/slice-764.md).

**Feat (slice 763): reaction affordances (G1) — discovery + trigger correlation**
Closes the biggest affordance gap: the reaction category was undiscoverable from `engine.query.*`. New `availableReactions(state, encounterId, combatantId)` → `{ id, label, trigger, enabled, reason? }[]` (owned reactions + their trigger kind, disabled when a condition blocks or the reaction is spent), and `reactionsForTrigger(state, encounterId, reactorId, triggerEvent)` → `{ id, label, intent }[]` (the correlation helper: given an `AttackRolled`/`DamageApplied`/`SpellCastDeclared`, ready-to-commit typed intents with params pre-filled; the consumer dispatches by `intent.type` to the matching planner). Wired + planner-faithful (verified by dispatching every correlated intent to its planner): Shield, Cutting Words, Uncanny Dodge, Counterspell. Deferred (framework-ready; need more than a single event + class check): Stone's Endurance (resolved ancestry), Protection (positional + style), Countercharm (charm/frighten context absent from SaveRolled), Deflect Attacks (attack linkage), Opportunity Attack (positional). Additive query surface.
Detail: [slice-763.md](docs/changelog/slice-763.md).

**Feat (slice 762): bonus-action registry — Innate Sorcery + Off-Hand Attack**
Adds the two cleanly-fitting bonus-action features the completeness sweep found missing from `bonusActions` (drivable but undiscoverable). Innate Sorcery (Sorcerer self-buff, spends `innate-sorcery`, disabled `already-active` while active) + Off-Hand Attack (two-weapon, creature target, available when wielding a `light` weapon — so the descriptor's `owns` was widened to `(character, state, content)` to read equipped gear). `InnateSorcery` added to the `planIntent` dispatch (useOption routes it) and removed from the planner-wiring allowlist; `OffHandAttack` was already dispatched. Deferred (need param-bag extensions): Paladin's Smite (slot + triggering attack), Conjure Pact Weapon (weapon-definition choice), Clouds Jaunt (destination); Metamagic excluded (a spell-cast modifier, not a menu action).
Detail: [slice-762.md](docs/changelog/slice-762.md).

**Fix (slice 761): bonusActions gates on the encounter being active**
`isActiveTurn` didn't check `encounter.status`, so in a created-but-not-started ('planning') encounter — `activeIndex` 0, no `activeEncounterId` — combatant 0 looked "active" and the encounter-only options (Cunning Action, Flurry, etc.) showed enabled, but their planners throw "only in an active encounter." Now requires `status === 'active'`. Verified with a planner cross-check. Query-side only.
Detail: [slice-761.md](docs/changelog/slice-761.md).

**Fix (slice 760): legalMoveDestinations honors the prone stand-up surcharge**
`remainingMovementFeet` (feeding `legalMoveDestinations` + the `availableActions` move gate) ignored Prone, returning the full speed budget — but `planMove` charges a `floor(speed/2)` stand-up surcharge on a prone move, so the query offered destinations the planner would reject. Now subtracts the surcharge (effective travel = `maxThisTurn - feetMoved - standUpCost`), matching the planner. Verified with a planner cross-check (prone speed-30 mover reaches 15 ft, not 20). Query-side only.
Detail: [slice-760.md](docs/changelog/slice-760.md).

**Fix (slice 759): spell-target affordance fidelity — Spare the Dying + AOE encounterId**
Two `legalSpellTargets` bugs from the correctness sweep. (1) The slice-757 dying-target fix was incomplete: it keyed on `resolves === 'heal'`, but a `stabilize` spell resolves as `'auto'`, so Spare the Dying returned zero legal targets — even though its only valid target is a 0-HP creature (the planner requires `hp.current === 0`). `includeDefeated` now also covers `stabilize` mechanics. (2) `aoePlacementPoints` read `state.activeEncounterId` instead of the `encounterId` argument, so AOE placement cells were empty for any non-active / not-yet-started encounter; now threads `encounterId`. Query-side only.
Detail: [slice-759.md](docs/changelog/slice-759.md).

**Fix (slice 758): attack affordance fidelity — ranged long range + Extra Attack**
Two affordance-layer bugs (found by the correctness sweep) where `engine.query.*` disagreed with the attack planner. (1) `weaponRangeFeet` capped ranged reach at `rangeNormal`; the planner allows out to `rangeLong` (attack with Disadvantage), so `legalTargets` omitted legal long-range targets and `availableActions` wrongly said `no-target-in-range`. Now uses `rangeLong ?? rangeNormal`. (2) `availableActions` disabled `attack` the instant the action was used; the planner allows further attacks while `attacksMadeThisTurn < maxAttacksPerAction`, so a Fighter mid-Extra-Attack was shown attack-disabled. Now mirrors `planActionEconomyForAttack` (Dash/Disengage/Dodge keep the once-per-action gate). Query-side only; planner + event shapes unchanged.
Detail: [slice-758.md](docs/changelog/slice-758.md).

**Fix (slice 757): healing spells can target a dying ally (`legalSpellTargets`) — pattern-fix**
The pattern-check sibling of slice 756: `legalSpellTargets` routed every creature-target spell through a helper that excluded all 0-HP combatants, so a downed ally was wrongly omitted from a healing spell's legal targets (reviving a dying creature is the primary use of Healing Word / Cure Wounds). `creatureCandidatesInRange` gains an `includeDefeated` flag; `legalSpellTargets` passes `resolves === 'heal'`. Offensive / buff spells unchanged (still exclude the defeated). New test: Healing Word includes a 0-HP creature; Fire Bolt still excludes it.
Detail: [slice-757.md](docs/changelog/slice-757.md).

**Engine (slice 756): bonus-action affordances — metered amount + creature targets**
Read-only additions so a consumer can drive amount / target selection for `engine.plan.useOption` (the dnd-web Bonus Actions menu). `BonusActionOption` gains `requiresAmount` (mirrors the descriptor flag) + `maxAmount?` (the spendable pool, e.g. the paladin's Lay on Hands points; overheal clamping stays engine-side). New `engine.query.bonusActionTargets(state, encounterId, combatantId, optionId)` → `{ combatantId, position? }[]` lists an option's legal targets honoring its reach + self / defeated rules (Lay on Hands = touch incl. a dying ally; Bardic = 60 ft excl. self; Flurry = reach), via a new per-descriptor `targeting` spec on all four creature-target options (pattern-check: no silent empty picker). Range is chebyshev on positions (positionless → no range filter). Additive query surface; `useOption` dispatch + event shapes byte-identical.
Detail: [slice-756.md](docs/changelog/slice-756.md).

**Driver/infra (slice 755): re-wire the combat-fuzz pre-damage reactions to the two-phase attack API**
Re-wires the slice-750/753 pre-damage reaction window onto the slice-754 engine seam: the resolver takes the attack intent and runs `engine.plan.attackRoll` → reaction cascade (Shield / Protection / Cutting Words) → `engine.plan.attackDamage`, so a prevented hit is committed from the roll alone and the damage phase is **never planned** (no discarded damage dice / on-hit riders / RNG, replacing `dropDamageChain` slicing). `engine.plan.attackDamage` is called at most once, only when the hit stands. `'none'` is untouched (byte-identical); `'auto'` shifts only where a reaction prevents a hit (intended; still deterministic + replay-equivalent, existing anchors still fire). New matrix guard: a Shield-prevented swing rolls no `DamageRolled` at all; the Protection resolver test reworked to drive a real two-phase attack.
Detail: [slice-755.md](docs/changelog/slice-755.md).

**Engine (slice 754): two-phase attack API (`attackRoll` / `attackDamage`)**
Splits `resolveAttack` into a roll phase (action-economy prelude + range/LoS/loading gates + the d20 attack roll, emitting `AttackRolled`) and a damage phase (the damage chain for a hit that stands), exposed as `engine.plan.attackRoll(state, intent)` → `{ events, roll }` and `engine.plan.attackDamage(roll)` → `{ events }`. A consumer opens a reaction window between them (RAW: `AttackRolled.hit` is decided in phase 1; a reaction may then prevent the damage), and the damage dice / on-hit riders are never rolled for a prevented hit. `engine.plan.attack` (bundled) composes the two byte-identically — the entire existing golden/fuzz/replay net stays green unchanged, plus a new composition golden pins `attackRoll ++ attackDamage === attack`. Both sub-planners are allowlisted in the planner-wiring audit (consumer-orchestrated, not their own intent). Also evicted the 0.10.0-alpha.0 release narrative to [released-versions-0.10.0-alpha.0.md](docs/changelog/released-versions-0.10.0-alpha.0.md) (doc-size discipline).
Detail: [slice-754.md](docs/changelog/slice-754.md).

**Driver/infra (slice 753): Protection reaction (positional, pre-damage attack window)**
Completes the reaction layer (damage 749 / attack 750 / cast 751 / save 752 / positional 753): a shield-bearing ally within 5 ft of an attacked creature imposes disadvantage on the attack roll, re-deciding the hit. Extends the slice-750 pre-damage window with an `isTactical` flag + a `chebyshevDistance ≤ 5` adjacency check on combatant positions, recomputing the hit via a new pure `disadvantageFlipsHit` and dropping the damage chain on a flip; engages only under `movement:'tactical'` + `reactions:'auto'`, composing the existing `planProtection`. No pack/AI change, so it won't fire in random fuzz (documented); a constructed test is the correctness gate and a tactical+auto matrix block proves replay-equivalence. Only the engine two-phase attack API remains deferred.
Detail: [slice-753.md](docs/changelog/slice-753.md).

**Driver/infra (slice 752): save reaction window (Countercharm) + charm-person in the fuzz AI**
Completes the combat-fuzz reaction set with the save window: a Bard L7 on a charmed/frightened creature's team rerolls the failed save with Advantage and, on success, removes the condition (post-commit, like the damage-mitigation reactions). Because the fuzz never produced a charm/frighten save, the AI also learns to cast charm-person under `reactions:'auto'` (gated, so `'none'` stays byte-identical) so the window can occur. Pure `hasCountercharm` + the resolver branch (correlates the failed `SaveRolled` for DC/ability/bonus, finds the Bard, emits `ConditionRemoved` on success); team ids threaded into `ReactionPolicyContext`. Rare in practice (~1% of L7 2v2 PC battles need bards on both sides + a landed charm), so a constructed unit test is the stable correctness gate and a golden anchor (seeds 112/206/275/281/391) shows it firing in real fuzz. Protection deferred.
Detail: [slice-752.md](docs/changelog/slice-752.md).

**Driver/infra (slice 751): spell-cast reaction window (Counterspell)**
Adds the spell-cast window to the combat-fuzz reaction layer: under `reactions:'auto'`, an enemy Wizard/Sorcerer Counterspells a leveled cast (CON-save outcome), and the countered spell's effects are omitted. RAW-faithful prepared (Counterspell added to arcane builds only under `'auto'` at L5+, so `'none'` stays byte-identical); `originalSpellLevel:0` avoids double slot consumption. Pure `shouldCounterspell` + resolver `scripts/reactions/pre-cast-policy.ts`. Countercharm / Protection deferred.
Detail: [slice-751.md](docs/changelog/slice-751.md).

**Driver/infra (slice 750): attack pre-damage reaction window (Shield + Cutting Words)**
Opens a window between the attack roll and the damage so prevent-the-trigger reactions genuinely cancel a hit. Driver-side two-phase flow under `reactions:'auto'` (plan uncommitted → Shield/Cutting-Words cascade → commit the full attack or, when prevented, the attack minus its damage chain); composes the existing `planShield`/`planCuttingWords` planners. `'none'` byte-identical.
Detail: [slice-750.md](docs/changelog/slice-750.md).

**Driver/infra (slice 749): deterministic reaction layer for the combat-fuzz driver**
A per-action reaction-policy seam in `runBattle` (mirroring the tactical-movement seam) fires damage-mitigation reactions (Uncanny Dodge, Deflect Attacks, Stone's Endurance — they emit a compensating `Healed`) off the events each action produces, so dnd-web can show them. Opt-in via a new `reactions:'auto'` option (default `'none'` byte-identical). Pure decision logic in `src/ai/reactions.ts`; glue in `scripts/reactions/reaction-policy.ts`. No new engine primitive / event / effect kind.
Detail: [slice-749.md](docs/changelog/slice-749.md).

## 0.6.0-alpha.0 - 2026-06-05

**Release (slice 701): bump to 0.6.0-alpha.0**

Promotes the post-0.5.0 cohort (slices 697-700) to a tagged release. `package.json` bumps `0.5.0-alpha.0` → `0.6.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1 (no persisted-shape changes). Net effect over 0.5.0: positioned Push now lands on a legal cell (an engine correctness fix), tactical arenas are richer (irregular rock borders, `difficult` + `water` terrain, occasional fenced pens), and the `normalizeEvents` determinism oracle handles compound ids — while the tactical movement policy itself is unchanged from 0.5.0 (the slice-697 convergence push was reverted in slice 699, so battles still accept draws).

**Breaking:** none. No engine `src/` public surface changed; `pushDestination` is an internal derive helper (not in the public barrel). `docs/breaking-changes-queued.md` was empty at cut time.

**RNG stream:** `'none'` (positionless) battles are byte-identical (fuzz-matrix + replay-equivalence pass unchanged). Tactical per-seed transcripts differ from 0.5.0 (the Push fix changes positioned shove destinations; the arena generator changed), but tactical mode is new this release cycle and behind the `movement: 'tactical'` option, so no consumer pins a tactical transcript across the boundary.

**Feat (slice 700): richer tactical arenas (irregular rock border, terrain types, fenced pens)**
Rewrites `generateArenaMap`: an irregular per-seed rock border (smooth edge random walks, so the playable shape varies by seed), fewer hard obstacles (impassable cover 0.18 → 0.07) plus passable `difficult` + `water` terrain, and an occasional fenced pen (an impassable ring with a guaranteed non-corner side gate, so it always has a real entrance) on the larger map. Dims enlarged a little (duel 18×13, squad 22×16). Connectivity stays structural via a protected spawn-to-spawn corridor (no border/fence/pillar can disconnect A↔B); deterministic; `'none'` unaffected (tactical-only). Verified over seeds 1-100: 0 connectivity failures, fences ~15% of seeds, every pen interior reachable from a spawn, draw rate unchanged (3.8%), 0 illegal moves. CHANGELOG note: this slice also evicted the 0.4.0-alpha.0 release narrative to [released-versions-0.4.0-alpha.0.md](docs/changelog/released-versions-0.4.0-alpha.0.md) (doc-size discipline).
Detail: [slice-700.md](docs/changelog/slice-700.md).

**Revert (slice 699): restore the slice-695 kiting tactical policy (accept draws again)**
Undoes the slice-697 convergence push: `planTacticalMove` goes back to the slice-695 flee/kite/close cascade, so tactical battles stalemate to draws again (≈4% over seeds 1-40 × {1v1,2v2}; seed 42 1v1 draws at the round cap), as at the 0.5.0 release — per request, forcing convergence wasn't wanted. **Kept** as orthogonal correctness improvements: slice 698 (Push lands on a legal cell) and the slice-697 `normalizeEvents` compound-ulid oracle fix. `policy.ts` / `constants.ts` / `move-policy.ts` + their unit tests restored to slice-695; the slice-697 convergence assertion removed (the slice-698 move-legality guard stays). `'none'` byte-identical; no API change.
Detail: [slice-699.md](docs/changelog/slice-699.md).

**Fix (slice 698): Push forced-movement lands on a legal cell, not an off-grid vector**
The weapon-mastery Push (and, by pattern-check, Open Hand Push) computed the shove destination by adding a *cell count* to a *feet* coordinate with no map validation, so a target could be shoved off-grid onto cover or off the map (seeds 19, 29 at 2v2). Slice 697's convergence surfaced it (melee Push hits now land). New pure `pushDestination` helper (`src/derive/pathing.ts`) steps the shove cell-by-cell and stops against the first out-of-bounds / impassable / occupied / closed-door cell, returning a grid-aligned position; both Push planners now use it. Verified: 0 illegal `CombatantMoved`/final positions across seeds 1-40 × {1v1,2v2} (matrix assertion added). Corrects positioned Push for every consumer, not just the fuzz. `'none'` byte-identical (positionless → Push emits no move); no API change.
Detail: [slice-698.md](docs/changelog/slice-698.md).

**Fix (slice 697): tactical movement converges instead of stalemating** — **Reverted by slice 699.**
The round-leashed `planTacticalMove` convergence model is no longer in the tree (the user opted to accept draws). Its `normalizeEvents` compound-ulid oracle fix was kept. Original detail (for the record): [slice-697.md](docs/changelog/slice-697.md).

**Release (slice 696): bump to 0.5.0-alpha.0**
Promotes the post-0.4.0 cohort (slices 689-695) to a tagged release: cross-repo sibling-consumer infra (689-692) + tactical movement support for the combat fuzz (693-695). No engine-API breaking change; `'none'` byte-identical; `SCHEMA_VERSION` stays 1.
Detail: [slice-696.md](docs/changelog/slice-696.md).

## Older releases

Tagged release `0.10.0-alpha.0` lives in [docs/changelog/released-versions-0.10.0-alpha.0.md](docs/changelog/released-versions-0.10.0-alpha.0.md); `0.9.0-alpha.0` lives in [docs/changelog/released-versions-0.9.0-alpha.0.md](docs/changelog/released-versions-0.9.0-alpha.0.md); `0.8.0-alpha.0` lives in [docs/changelog/released-versions-0.8.0-alpha.0.md](docs/changelog/released-versions-0.8.0-alpha.0.md); `0.7.0-alpha.0` lives in [docs/changelog/released-versions-0.7.0-alpha.0.md](docs/changelog/released-versions-0.7.0-alpha.0.md); `0.5.0-alpha.0` lives in [docs/changelog/released-versions-0.5.0-alpha.0.md](docs/changelog/released-versions-0.5.0-alpha.0.md); `0.4.0-alpha.0` lives in [docs/changelog/released-versions-0.4.0-alpha.0.md](docs/changelog/released-versions-0.4.0-alpha.0.md); `0.3.0-alpha.0` lives in [docs/changelog/released-versions-0.3.0-alpha.0.md](docs/changelog/released-versions-0.3.0-alpha.0.md); `0.2.0-alpha.0` lives in [docs/changelog/released-versions-0.2.0-alpha.0.md](docs/changelog/released-versions-0.2.0-alpha.0.md); `0.1.0-alpha.15` lives in [docs/changelog/released-versions-alpha-15.md](docs/changelog/released-versions-alpha-15.md); `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
