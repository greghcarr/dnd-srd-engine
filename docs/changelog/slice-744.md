# Slice 744 — fix: guard active-state re-activation across all activators (pattern fix)

**Type:** Bug fix (pattern sweep). Follows slice 743 (the Rage instance). Additive guards; non-active paths byte-identical.

## The pattern

Slice 743 fixed a Barbarian re-entering Rage while already raging (double Rage-use spend). A pattern hunt found the same shape elsewhere: **a Bonus-Action activator applies a persistent self "active-state" condition AND spends a limited resource, but doesn't guard against re-activating while that state is already active** — so the consumer (e.g. the dnd-web duel) could re-activate it each turn, double-spending the resource. The persistent condition never auto-ends (durations are consumer-managed), so the state is always "still active," making the re-activation always illegal.

## What changed

Each planner now throws when its active-state condition is already present on the character, before any resource / bonus-action spend (mirrors `planRage`):

| Planner | Active condition | Resource saved from double-spend |
|---|---|---|
| `planInnateSorcery` | `innate-sorcery-active` | an Innate Sorcery use (or 2 Sorcery Points) |
| `planSuperiorDefense` | `superior-defense-active` | 3 Focus Points (ki) |
| `planSacredWeapon` | `sacred-weapon-active` | Channel Divinity |
| `planFrenzy` | `frenzied` | a Rage charge |
| `planStonecunning` | `stonecunning-active` | a Stonecunning use |
| `planDragonWings` | `dragon-wings-active` | (none — toggle; guard added for consistency / to stop a redundant re-sprout that burns a Bonus Action) |

To re-activate legitimately, the consumer must first end the prior state (remove the condition — RAW: the buff's duration elapsed / was dismissed). This is the same contract as Rage.

### Not the bug (checked, left unchanged)

Patient Defense (`dodged` — a per-turn Dodge; re-each-turn is RAW, and the bonus-action gate blocks a same-turn double), Tactical Mind / Peerless Skill (outcome planners, not toggles), Stunning Strike (per-hit), Turn Undead (per-use, applies conditions to targets), Bardic Inspiration (grants a die to an ally).

## Byte-identity

The combat-fuzz AI takes each first-turn buff at most once per battle (`firstTurnBuffTried` is battle-lifetime), so the new throws never fire in the fuzz → goldens/fuzz byte-identical. One existing test re-activated Stonecunning to exhaust uses (slice-540 "exhausted uses"); it now ends each prior Stonecunning before the next activation (the RAW-required + now-enforced sequence) and was updated.

## Files

- [src/engine/plan/innate-sorcery.ts](../../src/engine/plan/innate-sorcery.ts), [superior-defense.ts](../../src/engine/plan/superior-defense.ts), [sacred-weapon.ts](../../src/engine/plan/sacred-weapon.ts), [frenzy.ts](../../src/engine/plan/frenzy.ts), [stonecunning.ts](../../src/engine/plan/stonecunning.ts), [dragon-wings.ts](../../src/engine/plan/dragon-wings.ts): the already-active guard.
- [tests/unit/engine/slice-744-active-state-reactivation.test.ts](../../tests/unit/engine/slice-744-active-state-reactivation.test.ts) (new): each planner throws when its active condition is present, and activates / rejects-for-another-reason when absent.
- [tests/unit/engine/slice-540-dwarf-stonecunning.test.ts](../../tests/unit/engine/slice-540-dwarf-stonecunning.test.ts): the exhaust-uses test ends each prior Stonecunning before re-activating.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green.

## Audit (Uncle Bob)

- **Pattern-check**: fixed every instance of the shape, not just the reported one (Rage in 743).
- **Single source of truth**: the planner enforces (throws); the consumer ends the prior state to re-activate.
- **SRD-faithful (to scope)**: stops the illegal re-activation / double-spend. Full duration/maintenance modeling (auto-end) remains the deferred Scope B, tracked from slice 743.
