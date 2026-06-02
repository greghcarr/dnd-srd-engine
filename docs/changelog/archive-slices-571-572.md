# Archive: slices 571-572

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 582, to keep the live file under the 60 KB single-Read ceiling). These slices closed the first two of the six missing L1 action planners surfaced by the deep audit: planHelp (both Attack + Ability Check modes) + planReady.

**Engine (slice 572): planReady — the L1 Ready action**

Closes the second of the six missing L1 action planners (slice 571 shipped Help). Pre-slice the Ready action had no engine path: a combatant could not declare a trigger-and-response that consumes their Action for the turn.

RAW (PHB 2024 ch.7 Ready action): "You take the Ready action to wait for a particular circumstance before acting. ... This lets you act using your Reaction before the start of your next turn. First, you decide what perceivable circumstance will trigger your reaction."

**New event** ([src/schemas/events/action-economy.ts](../../src/schemas/events/action-economy.ts)): `ActionReadied { encounterId, combatantId, trigger: string }`. Registered in [src/schemas/events/index.ts](../../src/schemas/events/index.ts) (import, union, type name, public re-export).

**New runtime field** ([src/schemas/runtime/encounter.ts](../../src/schemas/runtime/encounter.ts)): `TurnUsage.readiedAction?: { trigger: string }`. Stamped by the reducer; cleared by `applyTurnStarted` when the combatant's next turn begins (RAW: "before the start of your next turn"). Additive defaulted-to-undefined — no SCHEMA_VERSION bump, no migration (Zod default loads old saves).

**Reducer** ([src/engine/reducers/action-economy.ts](../../src/engine/reducers/action-economy.ts)): new `applyActionReadied` stamps `turnUsage.readiedAction`. The Reaction is NOT pre-consumed (RAW: the Reaction fires when the trigger occurs, and the consumer's subsequent reactive planner consumes it). Wired into [src/engine/apply.ts](../../src/engine/apply.ts) switch.

**Planner** ([src/engine/plan/ready.ts](../../src/engine/plan/ready.ts)): `planReady({ combatantId, trigger })`. Validates `assertActorCanAct`, encounter context (must be on combatant's turn), action not already used, non-empty trigger. Emits `ActionEconomyConsumed { kind: 'action' }` + `ActionReadied { trigger }`.

**Out of scope (future engine surface)**: trigger-and-execute machinery. When the trigger fires, the consumer calls the existing reactive planners (planAttack, planCastSpell, etc.) themselves, consuming the Reaction at that point. The readied-spell Concentration semantic (RAW: "holding onto the spell's magic requires Concentration") is consumer-managed via the existing planCastSpell concentration path.

**Wiring**: [src/engine/plan/index.ts](../../src/engine/plan/index.ts) (re-export), [src/engine/index.ts](../../src/engine/index.ts) (Engine.plan.ready), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`Ready` dispatch — planner-wiring audit's `performIntent` requirement), [tests/transcript.ts](../../tests/transcript.ts) (formatEvent ActionReadied line).

**Tests** ([tests/unit/engine/slice-572-ready.test.ts](../../tests/unit/engine/slice-572-ready.test.ts), 8 cases): on-turn Ready emits ActionEconomyConsumed + ActionReadied; post-commit turnUsage.readiedAction carries the trigger; Reaction stays available; readiedAction clears at next TurnStarted; off-turn Ready throws; out-of-encounter Ready throws; double-Action-use throws; empty trigger throws; Incapacitated combatant throws.

**Audit:**
- **Names:** `ActionReadied` mirrors `ActionEconomyConsumed` / `RecklessAttackActivated` event-name convention; `readiedAction` on turnUsage mirrors `recklessAttackActive` / `noProvokeMovementUpToFeet` per-turn-state convention.
- **DRY:** the planner is a one-purpose 90-line file; the reducer is 9 lines; no shared helper because the surface area is small.
- **SRP:** schema + reducer + planner each in their own file; existing TurnStarted clears the new field alongside the other per-turn flags.
- **Magic numbers:** none.
- **at-threading:** single `nowIso()` per planner pass-through to both emitted events.
- **Mechanical outcomes asserted:** 8 cases covering both happy paths and 5 negative gates.

**Pattern-check:** Ready is the second of 6 missing L1 actions. The remaining 4 (Search, Study, Influence, Utilize) are largely thin wrappers over `planAbilityCheck` (Search = WIS check; Study = INT check; Influence = CHA check with target-set DC; Utilize = object interaction). Deferred to future slices — lower impact, similar shape.

---

**Engine + content (slice 571): planHelp — the L1 Help action, both modes**

Closes one of the six missing L1 action planners surfaced by the deep audit. Pre-slice Help was a documented gap: a Helper had no engine path to confer Advantage on an ally's check or distract a foe for an ally's attack. Slice 571 ships `planHelp` with both RAW modes.

RAW (PHB 2024 ch.7 Help action):
- **Help (Attack)**: "You momentarily distract a foe within 5 feet of you. The next attack roll one of your allies makes against that foe before the start of your next turn has Advantage on the attack roll."
- **Help (Ability Check)**: "You momentarily help another creature do something. ... The creature has Advantage on that ability check."

**Planner** ([src/engine/plan/help.ts](../../src/engine/plan/help.ts)): `planHelp({ helperId, targetId, mode: 'attack' | 'check' })`. Validates the helper isn't Incapacitated (`assertActorCanAct`); rejects self-help; consumes the helper's Action when invoked in an active encounter on their turn; emits `ConditionApplied` for the appropriate condition with `sourceCharacterId = helper.id` and `expiresOnRound = currentRound + 1, expiryTrigger: 'turnEnd'`. Out-of-encounter use bypasses the action gate (RAW: skill checks happen outside combat too).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- **`helped-against-active`** (Attack mode): `GrantAdvantageToAttackers` + `consumeOnIncomingAttack: true` + `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }`. The first attack against the foe consumes the condition; the autoExpiry sweeps any unused condition at the helper's next-turn-end (matching "before the start of your next turn").
- **`helped-on-check-active`** (Ability Check mode): `SetAdvantage { on: { kind: 'check' }, mode: 'advantage' }` (wildcard ability) + `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }`. The bearer gets Advantage on any ability check until expiry.

**Documented RAW deviations:**
- The Ability Check mode does NOT enforce "consumed on the first check" — the engine has no `consumeOnCheck` primitive yet (the existing `consumeOnAttack` / `consumeOnIncomingAttack` are attack-side only). A future engine slice can add parity; the impact is bounded (the autoExpiry sweeps at turn-end, so multiple checks within one round get advantage instead of just the first).
- The 5-foot proximity gate for Attack mode is consumer-managed (the engine doesn't track positions).
- The "helper must be proficient in the chosen skill" gate (Ability Check mode) is consumer-managed (the planner doesn't require a skill id).

**Wiring**: [src/engine/plan/index.ts](../../src/engine/plan/index.ts) (re-export), [src/engine/index.ts](../../src/engine/index.ts) (Engine.plan.help + planHelp import), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`Help` dispatch entry — planner-wiring audit's `performIntent` requirement).

**Tests** ([tests/unit/engine/slice-571-help.test.ts](../../tests/unit/engine/slice-571-help.test.ts), 8 cases): pack declarations for both conditions; Attack mode applies the condition with `sourceCharacterId = helper`, ally's first attack rolls with Advantage, the condition is consumed on the first incoming attack so the second attack doesn't get the bonus; Check mode applies the condition, ally's ability check rolls with Advantage; helping yourself throws; an Incapacitated helper throws.

**Doc-count updates**: conditions 140 → 142 (rider 125 → 127); updated in [docs/getting-started.md](../getting-started.md), [docs/status.md](../status.md) (×2 rows), [docs/starter-pack-gaps.md](../starter-pack-gaps.md). Coverage snapshot ([tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)) gains the two new conditions in the wired-catalog list.

**Audit:**
- **Names:** `helped-against-active` mirrors the existing `<verb>ed-<gate>-active` convention (e.g. `vexing-active`, `hexed-STR-active`); `helped-on-check-active` is verbose but unambiguous about the gate (check vs attack).
- **DRY:** the two conditions follow the slice-571 pattern of a one-shot advantage with autoExpiry — no shared helper because the two condition entries are 1 JSON object each and inlining is clearest.
- **SRP:** planner is one file, ~70 lines; two new content entries; the existing `consumeOnIncomingAttack` reducer (slice 484) and `autoExpiry` sweep (slice 269) consume the conditions without engine change.
- **Magic numbers:** none.
- **at-threading:** single `nowIso()` per planner pass-through; the encounter-round read is one resolution; `expiresOnRound` stamped once.
- **Mechanical outcomes asserted:** 8 cases — pack declarations + per-mode condition application + consume-on-first-incoming-attack + Advantage on first ally attack + Advantage on first ability check + self-help / Incapacitated-helper negative controls.

**Pattern-check:** Help is the simplest of the missing L1 actions — the next 5 (Ready, Search, Study, Influence, Utilize) follow similar planner shapes but each needs its own RAW-specific wiring (Ready needs reaction-window state; Search / Study are largely AbilityCheck wrappers with a category; Influence is a CHA-check wrapper with target-specific DC). Slice 572 ships Ready; the other four are lower-impact and deferred to future slices.

---
