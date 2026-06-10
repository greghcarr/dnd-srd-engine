# Slice 783 — edition drift: Sleep is the SRD 5.2.1 save/escalation spell (not the 2014 HP-pool knockout)

**Type:** Engine edition-drift fix + a small save-mechanic primitive (`src/engine/plan/cast-spell.ts`, `recurring-save.ts`, content). Third of the [L7 audit](../l7-completion-audit.md) Area 1 sweep (`sleep-hp-pool`). No public-API change.

## The bug

Sleep shipped the **2014** `hp-pool-knockout` (5d8 + 2d8/slot HP pool → Unconscious). SRD 5.2.1 ([`spells.md`](../../references/srd-markdown/spells.md)) is a **Wisdom save** → Incapacitated until the end of the target's next turn → repeat save → 2nd failure → **Unconscious** for the duration; **Concentration**; the spell ends on a target that takes damage; and "creatures that don't sleep, such as elves, or that have Immunity to the Exhaustion condition automatically succeed."

## The fix — mostly existing primitives

The escalation I expected to need a new primitive **already existed**: `recurringSave.onFail: 'escalateToCondition'` (Cockatrice's Restrained → Petrified, slice 488). Sleep ≈ Hold Person (`{ kind: 'save', ability: 'WIS', conditionOnFail }` + Concentration) + that escalation.

- **New condition `sleep-drowsy-active`** — Incapacitated (added to `ACTION_BLOCKING_CONDITIONS`, mirroring `hideous-laughter-active`) carrying `recurringSave { ability: WIS, trigger: turnEnd, onSuccess: removeCondition, onFail: escalateToCondition → 'unconscious' }`.
- **Sleep pack entry** → `{ kind: 'save', ability: 'WIS', conditionOnFail: 'sleep-drowsy-active', conditionEndsOnDamage: true, autoSucceedIfImmuneToConditionId: 'exhaustion' }` (Concentration was already declared).
- **`recurring-save` escalation propagation** (the one genuine gap): the escalated condition now inherits `endsOnDamage` + `sourceEffectInstanceId` from the original, so Sleep's escalated Unconscious still ends on damage and clears when the caster drops Concentration (`clearConcentrationEffect` sweeps by `sourceEffectInstanceId`). No-op for Cockatrice (fixed-DC, non-concentration).
- **Concentration binding for save-applied conditions**: `planSaveMechanic` now stamps `sourceEffectInstanceId` (the concentration effect) on the `conditionOnFail` condition, so it (and, via propagation, the escalated one) clears on a drop.

## New primitive — the auto-succeed clause

- **`SpellSaveMechanicSchema.autoSucceedIfImmuneToConditionId`** (opt-in): a target auto-succeeds (full skip — no save, no condition) if it is immune to the named condition **or** to the mechanic's own `conditionOnFail`. Sleep sets `'exhaustion'`; **Elf Trance** is modeled as `GrantConditionImmunity` to `sleep-drowsy-active`, so elves auto-succeed via the `conditionOnFail` arm. Both RAW clauses, one opt-in arm; other save spells are unaffected.

## Known limitation

Sleep's escalated Unconscious inherits the engine's existing partial-Unconscious modeling (the attackers-have-Advantage arm is unwired) — a shared gap tracked as `drop-to-0-no-unconscious-arms` (Area 4), not Sleep-specific.

## Tests

- **New** `tests/unit/engine/slice-783-sleep-2024.test.ts` (8): pack shape; cast → fail → drowsy (Incapacitated, ends-on-damage, concentration-bound); tick → 2nd fail → Unconscious carrying ends-on-damage + the concentration link; tick → success → drowsy removed, no escalation; Elf auto-succeed (no save, no condition); Exhaustion-immune (Skeleton) auto-succeed.
- `tests/unit/engine/spell-coverage.test.ts`: `sleep` `hp-pool-knockout` → `save`.
- Removed `tests/unit/engine/plan-sleep.test.ts` (the obsolete 2014 HP-pool behavior test; superseded by slice-783). `slice-391-ends-on-damage.test.ts`'s Sleep sub-test repointed to `sleep-drowsy-active`.
- Audits: `pack-integrity` `EFFECT_LESS_OK` + `incapacitated-parity` (`INCAPACITATING_CONDITIONS` in `combat.ts` gains `sleep-drowsy-active`, so becoming drowsy ends the bearer's own Concentration) updated; the `+1` condition count bumped in `getting-started.md` / `status.md` / `starter-pack-gaps.md` (159 total / 144 rider).

## Verification

`npx tsc --noEmit` clean; full `npx vitest run` green. The coverage snapshot is unchanged (`sleep-drowsy-active` carries empty effects, like the other Incapacitated-variant conditions).
