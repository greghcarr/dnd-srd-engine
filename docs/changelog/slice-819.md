# Slice 819 — Protective Magic (3/Day): monster Counterspell/Shield as a per-day-pooled reaction

**Type:** Engine (a shared helper + a refactor + two intent fields) + content (Mage + Archmage). Advances the [L7 audit](../l7-completion-audit.md) `npc-caster-bonus-action-groups` quirk — its last spell item.

## The gap

The Mage and Archmage print a **Reaction — Protective Magic (3/Day)**: "casts *Counterspell* or *Shield* in response to the spell's trigger." Two engine facts made this the hardest of the bonus-action groups:

- **Counterspell and Shield are dedicated planners** (`planCounterspell` / `planShield` in `reactive-spells.ts`) — off the generic `castSpell` path, like Misty Step — and they expend a spell **slot**. A slot-less monster couldn't cast them.
- It's a **shared 3/Day pool** across the two (the slice-818 problem again).

## The design

With Misty Step (817), Counterspell, and Shield now all being **dedicated planners** that need slot-less NPC per-day metering, the duplicated logic crossed the rule-of-three — so it was extracted:

- **New `resolvePerDayFreeCast` helper** (`src/engine/plan/_per-day-free-cast.ts`) — resolves the bearer's `perLongRest` grant for a spell, checks the budget (shared across a `perDayPoolId` group, else per-spell), and returns the `PerDayCastUsed` event to emit instead of `SpellSlotConsumed`. It's the perDay+pool subset of castSpell's slice-794/818 free-cast path. **Misty Step (817) was refactored onto it** (its slice-817 tests stay green), and **`planCounterspell` / `planShield` now use it** when their new `useFreeCast` intent flag is set: the **caster's** slot is replaced by a `PerDayCastUsed` against the shared pool (Counterspell's separate slot loss for the *countered* caster is untouched; the reaction economy + CON save / +5 AC are unchanged).
- **Reuses slice-818 `perDayPoolId`** — Counterspell + Shield are tagged `perDayPoolId: 'protective-magic'`, so they draw from one 3/Day budget with no new metering model and no resource seeding (the per-day counter is base character state).

## Content

The Mage and Archmage each gain `counterspell` + `shield` as `perLongRest` `GrantSpell`s: `usesPerLongRest: 3`, `perDayPoolId: 'protective-magic'`, `spellcastingAbility: 'INT'`. (Both spells already exist; both are RAW Reactions, so no cast-time override is needed.)

## Scope note

This ships the **cast + metering** seam (a consumer driving the Mage can now make it Counterspell/Shield, metered). Surfacing Protective Magic in the reaction-**discovery** affordance layer (`availableReactions` / `reactionsForTrigger`) for monsters is a separate query-layer concern, not wired here.

## Uncle Bob audit

- **DRY at the rule of three:** the per-day-free-cast logic now lives once (`resolvePerDayFreeCast`) instead of three inline copies; slice 817 deliberately deferred the helper until a third call site existed — this is it. `castSpell` keeps its own richer copy (it also handles once/pool-resource paths); the helper is the shared perDay+pool subset.
- **Single responsibility:** the helper only decides "per-day meter event or throw"; each planner still owns its reaction economy / save / AC logic.
- **Open/closed:** Counterspell/Shield gain one ternary on `useFreeCast`; the player slot path is byte-identical (verified — `plan-shield`, `s22-reactive-spells`, `showcase` stay green).
- **No new event/effect/schema:** reuses `PerDayCastUsed`, `perDayCastsUsed`, and the slice-818 `perDayPoolId`/grant passthrough.
- **Tests pin behavior:** each spell cast as a Reaction (reaction economy + PerDayCastUsed, no caster slot), the shared-budget proof (three Counterspells block a never-cast Shield), and the long-rest refresh.

## Tests

`tests/unit/engine/slice-819-protective-magic.test.ts` (5): the Mage + Archmage ship the pooled Counterspell/Shield grants; a slot-less Mage casts **Shield** as a Reaction (reaction `ActionEconomyConsumed` + `PerDayCastUsed`, no caster `SpellSlotConsumed`); same for **Counterspell** (the CON `SaveRolled` still fires, the caster's slot is replaced); **three Counterspells exhaust the 3/Day pool and block a never-cast Shield** (and a fourth Counterspell); a long rest refreshes it. Misty Step (817) + player slot Shield/Counterspell stay green.

## Verification

`npx tsc --noEmit` clean; coverage/exports/phantom-field snapshots unchanged; `npm run test:fast` green.
