# Slice 816 — Spiritual Weapon's immediate attack no longer costs the Action

**Type:** Engine fix (schema field + planner predicate) + content flag (2 spells). **Closes** the [L7 audit](../l7-completion-audit.md) `spiritual-weapon-immediate-attack-action-cost` divergence (surfaced by slice 815).

## The bug

`cast-spell.ts` charges a Bonus-Action spell **both** a Bonus Action and an Action when you cast it at a target — modeling a spell whose attack is a *separate* Magic action. Slice 603 added this for **Produce Flame** ("take a Magic action to hurl fire") and keyed it on a content heuristic: `castingTime === 'Bonus Action'` + an `attack` mechanic + `duration !== instantaneous` + a target.

That heuristic over-fires. Three pack spells match it:

| Spell | RAW | Separate Magic action? |
|---|---|---|
| Produce Flame | "you can take a **Magic action** to hurl fire" | **Yes** — cast (BA) + hurl (Action) |
| Flame Blade | "**As a Magic action**, you can make a melee spell attack" | **Yes** |
| Spiritual Weapon | "you can **immediately** make one melee spell attack" | **No** — the attack is part of the BA cast |

So every Spiritual Weapon caster (cleric, player, **and** monster) was wrongly losing their Action when casting it at a target.

## The fix

Replaced the duration heuristic with an **explicit per-attack flag** — a new optional `requiresMagicAction` on the spell attack mechanic (`SpellAttackMechanicSchema`). It's authored `true` on **Produce Flame** and **Flame Blade** (their attack genuinely is a separate Magic action) and left unset on **Spiritual Weapon** (immediate-on-cast). The planner's `consumesImplicitMagicAction` now keys on the flag, not `duration`:

```
const attackRequiresMagicAction = spell.mechanicalEffects.some(
  (m) => m.kind === 'attack' && m.requiresMagicAction === true,
);
const consumesImplicitMagicAction =
  castingTimeKind === 'bonusAction' && attackRequiresMagicAction && intent.targetIds.length > 0;
```

Result: Spiritual Weapon at a target costs only the Bonus Action; Produce Flame / Flame Blade still cost both (the slice-603 behavior is preserved unchanged).

## Tests

- **`tests/unit/engine/slice-816-spiritual-weapon-magic-action.test.ts`** (4): a player **cleric** casting Spiritual Weapon at a target spends only the Bonus Action (proving the fix is class-agnostic, not monster-specific); a druid's **Flame Blade** still spends Bonus Action + Action; the `requiresMagicAction` flag is authored correctly; and a **durable invariant** guards the heuristic→flag switch — any BA-cast persistent (non-instantaneous) attack spell that isn't on the immediate-attack allowlist must carry the flag (so a future Produce-Flame-like spell can't silently lose the Action cost).
- **slice-603** (Produce Flame BA + Action) stays green unchanged — the regression guard that the flagged case still works.
- **slice-815** test #4 flipped from the characterized buggy behavior to the fixed behavior (Cultist Fanatic's Spiritual Weapon now spends only the Bonus Action).

## Uncle Bob audit

- **Single responsibility:** the predicate now expresses one idea (does this attack cost a separate Magic action?) read from data, instead of inferring it from an unrelated proxy (duration).
- **No new coupling:** the flag lives on the attack mechanic it describes; the planner reads it the same way it reads every other attack-mechanic field. No new branch, event, or effect kind.
- **Names reveal intent:** `requiresMagicAction` / `attackRequiresMagicAction` vs the old `hasNonInstantaneousDuration` proxy.
- **Tests pin behavior, not implementation:** both economy branches + an invariant against the failure mode the switch introduces.

## Verification

`npx tsc --noEmit` clean; coverage/exports/phantom-field snapshots unchanged; `npm run test:fast` green.
