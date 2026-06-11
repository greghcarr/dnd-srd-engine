# Slice 821 — NPC reaction discovery (monster Protective Magic in the affordance layer)

**Type:** Engine (query-layer seam + a shared helper). Closes the [L7 audit](../l7-completion-audit.md) `npc-reaction-discovery` follow-up that slice 820 tracked.

## The gap

Slice 819 wired the Mage/Archmage *Protective Magic* (Counterspell/Shield) **cast + metering** path. But the reaction-affordance layer (`engine.query.availableReactions` / `reactionsForTrigger`, slices 763-767) enumerates reactions from **class features / prepared spells** — the Shield + Counterspell registry descriptors' `owns` checked `preparedSpells`, and their `correlate` required an arcane **class** (for the save DC) + a 3rd-level **slot**. A monster has none of those (its reactions live in effect-stack `GrantSpell` grants, its DC in a `SetSpellcastingProfile`, its budget in a per-day pool). So a consumer driving the Mage couldn't *discover* Counterspell/Shield — it had to know to offer them.

## The fix

Extended the two registry descriptors with a monster path, sharing the per-day budget logic with slice 819:

- **New `perDayFreeCastAvailable`** (`_per-day-free-cast.ts`) — the non-throwing read of "is there a `perLongRest` grant for this spell with budget remaining?", factored out of `resolvePerDayFreeCast` (both now route through one private `resolvePerDayBudget`, so the pooled-budget math lives once).
- **`owns`** (Shield, Counterspell): `preparedSpells.includes(X)` **or** `grantedReactionAvailable(...)` — a granted per-day pool with budget, gated on `statblockId` (a monster) so the common player path skips the effect-stack build.
- **`correlate`**: a branch — players keep the class + slot path; a monster builds a `useFreeCast` intent (so the cast meters via the pool, slice 819) with `castingClassId: ''` (the flat statblock DC comes from the `SetSpellcastingProfile`). The structural "worth it" filters are class-independent and reused: Shield's "+5 would flip the hit", Counterspell's "leveled spell only".

Players are unaffected (the `statblockId` gate); the existing 22 reaction-affordance tests stay green.

## Uncle Bob audit

- **DRY:** the pooled per-day budget computation now lives once (`resolvePerDayBudget`), consumed by both the throwing cast helper and the non-throwing affordance read; the descriptors reuse the existing decision predicates' structural parts.
- **Open/closed:** `owns`/`correlate` gain an `or` / a branch; the registry shape, the 9-reaction coverage, and every other descriptor are untouched.
- **Single source of truth preserved:** enumeration (`availableReactions`) and correlation (`reactionsForTrigger`) still read the same `REGISTRY`, so they can't drift — the monster path is added in one place and both see it.
- **Planner-faithful:** the correlated `useFreeCast` intent is verified accepted by `engine.plan.counterspell`/`shield` (emits `PerDayCastUsed`, no caster slot) — the fidelity bar the affordance layer holds.
- **No new event/effect/schema.**

## Tests

`tests/unit/query/slice-821-npc-reaction-discovery.test.ts` (5): `availableReactions` surfaces a Mage's granted Counterspell + Shield (enabled); `reactionsForTrigger` correlates Counterspell from an enemy leveled cast (intent `useFreeCast: true`, `castingClassId: ''`) and Shield from a hit the +5 would flip — each **dispatched to its planner** emits `PerDayCastUsed` with no Mage slot; an **exhausted** Protective Magic pool hides both; a plain fighter (no grant, not prepared) is offered neither.

## Verification

`npx tsc --noEmit` clean; coverage/exports/phantom-field snapshots unchanged; `npm run test:fast` green. With this the `npc-caster-*` family (spellcaster-npc → sweep → bonus-action groups → reaction discovery) is fully closed.
