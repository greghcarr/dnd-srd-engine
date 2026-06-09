# Slice 766 — reaction affordances: Opportunity Attack (leaves-reach trigger)

**Type:** Engine query surface (additive). Wires the last positionally-triggered deferred reaction.

## Why

Opportunity Attack was deferred from the reaction layer because its trigger isn't one of the event kinds slice 763 modelled — it fires when a creature *leaves your reach*, i.e. on a `CombatantMoved`, and needs the reactor's position + melee reach. That's a positional move trigger, now addable.

## How

[src/query/reactions.ts](../../src/query/reactions.ts):
- New `ReactionTriggerKind` `'leaves-reach'` → `CombatantMoved` (in `TRIGGER_EVENT_TYPE`).
- **Opportunity Attack** registry entry: `owns` = the reactor wields a main-hand melee weapon (the only thing it can OA with). Correlate from a `CombatantMoved`:
  - the mover isn't the reactor;
  - the reactor isn't the active combatant (`planOpportunityAttack` rejects an active-turn reactor — you take OAs on others' turns);
  - the mover was within the reactor's melee reach at `fromPosition` and is beyond it at `toPosition` (chebyshev; the reach is 5 ft, +5 for a `reach` weapon);
  - intent `{ reactorId, targetId: mover, weaponInstanceId }`.

  `planOpportunityAttack` resolves via `resolveAttack` directly (no `assertWeaponInRange`), so an attack on a creature that has just left reach is accepted — the correlation is planner-faithful.

## Tests

[tests/unit/query/reactions.test.ts](../../tests/unit/query/reactions.test.ts) — slice 766 block: an enemy leaving reach offers a melee reactor an OA and the planner accepts it; a mover that stays within reach offers nothing; a reactor without a melee weapon doesn't own it. (The mover wins initiative so the reactor is correctly non-active.)

Full `npx vitest run` green.

## Status

Reaction coverage: Shield / Cutting Words / Uncanny Dodge / Counterspell (763) + Stone's Endurance / Protection (765) + Opportunity Attack (766). Remaining deferred — both need **cross-event** context a single trigger event can't carry, addressed next via an additive `recentEvents` param: Deflect Attacks (the attack event linked from the damage) and Countercharm (the Charmed/Frightened context the `SaveRolled` lacks).
