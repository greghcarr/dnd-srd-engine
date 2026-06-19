# Slice 904 — Verify the reaction registry; wire the Storm's Thunder gap (`verify-reaction-registry-l1-7`)

**Type:** Engine (reaction affordance) + verification. Closes the L7 audit Area-9 `[verify]` row.

## The verification

The audit row asked: does `reactionsForTrigger` / `availableReactions` (`src/query/reactions.ts`) cover the reactions an L1–7 SRD expert expects, or are the gaps documented as event-stream-only? Cross-referencing the registry against the in-scope reaction inventory (the SRD subclasses, species, and the L0–4 reaction-cast spells) surfaced two things.

## The gap (a real one): Storm's Thunder

The Goliath Giant Ancestry option **Storm's Thunder** ("When you take damage from a creature within 60 feet, take a Reaction to deal 1d8 Thunder to that creature") had a full planner (`engine.plan.stormsThunder`, slice 559) but was **never added to the reaction registry** — unlike its identical-trigger sibling **Stone's Endurance**, which is in it. So a Goliath who chose Storm's Thunder got **no reaction surfaced** on a damage event, a consumer-facing asymmetry between two siblings of the same feature.

Fixed by adding the registry descriptor (mirroring Stone's Endurance):

- **`owns`**: `hasStonesEndurance` (the shared goliath-has-ancestry-uses guard) + the resolved ancestry choice pinned to `storms-thunder`.
- **`correlate`** (trigger `damage`): the attacker to retaliate against is read off `DamageApplied.sourceCharacterId` (which attack damage populates — `attack.ts`); with no known source (environmental damage) it doesn't correlate. The 60-ft range is consumer-managed, refined here when both positions are known (mirroring Countercharm / Protection). Produces a `StormsThunderIntent` the existing planner accepts.

`StormsThunderIntent` joins the `ReactionIntent` union.

## The confirmation: reaction-cast spells are event-stream-only by design

The L0–4 reaction-cast spells **Hellish Rebuke** and **Feather Fall** are intentionally NOT in the registry: they're cast through `engine.plan.castSpell` when their trigger fires, so the consumer drives the timing — there's no standing "feature" to enumerate, and Feather Fall's "a creature falls" trigger isn't even a combat `ReactionTriggerKind`. (Shield and Counterspell ARE surfaced because they have dedicated reaction planners + decision predicates the engine auto-suggests.) This is now documented in the `reactions.ts` coverage header.

## Consumer follow-up (documented, not breaking)

Adding `StormsThunder` to the exported `ReactionIntent` union does **not** break dnd-web's typecheck — its `CorrelatedReaction` is a `ReturnType<…>` and its `dispatchReaction` switch has a graceful `default`. But that default no-ops, so dnd-web should add a `case 'StormsThunder'` to actually commit the retaliation. Recorded as gap #7 in [consumer-handoff-dnd-web.md](../consumer-handoff-dnd-web.md).

## Pattern-check

The sibling asymmetry was the tell: Stone's Endurance and Storm's Thunder are the two damage-triggered Goliath ancestry reactions; one was registered, one wasn't. Both now are. The other four ancestry options (Cloud's Jaunt, Fire's Burn, Frost's Chill, Hill's Tumble) are bonus-action / on-hit riders, not reactions, so they're correctly absent from the reaction registry.

## Tests

New `slice 904` block in `tests/unit/query/reactions.test.ts` (3 tests): a Storm's Thunder Goliath is offered it on damage from an attacker and the planner accepts the correlated intent; no offer without a known attacker (sourceless/environmental damage); a Goliath who chose a different ancestry isn't offered it. The shared `seedAncestry` helper now includes the selected option so any ancestry can be exercised.

## Counts

No count change — no new condition / effect / spell / feat / event type / mechanic kind. This makes an already-wired planner discoverable.

## Audit

- Struck `verify-reaction-registry-l1-7`; Rollup: **Area 9** `8 → 7` open / `0 → 1` closed (`0/3/5 → 0/3/4`); **Total** `17 → 16` open / `100 → 101` closed / `0/6/11 → 0/6/10`. The only remaining engine-repo row is the `engine-scope-encumbrance-doc` doc reconciliation.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (671 files, 4974 passed / 165 skipped); `planner-wiring` + the slice-559 / slice-821 reaction tests pass unchanged. `doc-size` + `doc-links` + `doc-counts` audits green.
