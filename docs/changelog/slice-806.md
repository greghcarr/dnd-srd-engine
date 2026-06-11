# Slice 806 — one spell slot per turn

**Type:** Engine planner gate + a per-turn flag. **Closes** the [L7 audit](../l7-completion-audit.md) Area 4 divergence `bonus-action-spell-restriction`.

## The gap (and an edition-drift correction)

The audit row described the **2014** rule ("cast a spell with a Bonus Action → your Action that turn can only be a cantrip"). That rule was **removed in 2024**. The actual SRD 5.2.1 rule (`spells.md`) is simpler and different:

> *"On a turn, you can expend only one spell slot to cast a spell. This rule means you can't, for example, cast a spell with a spell slot using the Magic action and another one using a Bonus Action on the same turn."*

So you **can** pair a slot spell with a cantrip (a cantrip expends no slot); what's forbidden is expending **two slots** in one turn (e.g. Bonus Action Spiritual Weapon + Action Fireball). Implementing the audit's literal 2014 wording would have *introduced* edition drift. The fix enforces the real 2024 rule.

## The fix

- New combatant flag `TurnUsage.spellSlotExpendedThisTurn` (the established per-turn-flag pattern, reset at `TurnStarted`).
- Set it when a `SpellSlotConsumed` **or** `PactSlotConsumed` lands while the caster is the active combatant (`markSpellSlotExpended` in the spellcasting reducers; no-op outside an encounter, where there's no turn to limit). Pact slots count — RAW Pact Magic slots *are* spell slots.
- `planCastSpell` throws when a cast would expend a slot (`spell.level > 0 && !noSlotCost`) and the flag is already set. Cantrips, rituals, and free / at-will / Magic-Item casts (no slot) are exempt.

## Tests

`tests/unit/engine/slice-806-one-slot-per-turn.test.ts` (4): a Bonus Action slot spell (Healing Word) then an Action slot spell (Guiding Bolt) the same turn is blocked (`/one slot per turn/`), and the flag is set after the first; a slot spell + a cantrip (Sacred Flame) is allowed; a fresh turn clears the flag and re-allows a slot cast; and outside an encounter there is no restriction.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (589 files, 4532 passed) — no golden transcript relied on an (illegal) two-slot turn.
