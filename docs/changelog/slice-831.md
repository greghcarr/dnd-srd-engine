# Slice 831 — monster Parry reaction

**Type:** Engine primitive (effect + reaction planner + affordance descriptor) + canonical content users. Closes the [L7 audit](../l7-completion-audit.md) `monster-parry-reaction` divergence.

## The gap

Several martial NPCs print a **Parry** reaction (SRD 5.2.1):

> **Parry.** *Trigger:* The knight is hit by a melee attack roll while holding a weapon. *Response:* The knight adds 2 to its AC against that attack, possibly causing it to miss.

The engine had dedicated reaction planners (Shield, Counterspell, Uncanny Dodge, Protection, …) but **no generic monster reaction** — the Knight / Bandit Captain / Gladiator / Noble / Warrior Veteran couldn't Parry. Structurally it's `planShield` without the slot: a reaction that bumps AC against the triggering hit and reports whether the bump flips the hit to a miss.

## What shipped

### The primitive

- **`GrantParry { acBonus }`** effect (`schemas/effects.ts`), folded by `buildEffectStack` into `parryBonus()` (the largest contributed bonus, or `undefined`). A monster trait, exactly the slice-820 `GrantTreeStride` / `GrantMagicResistance` pattern but parameterized.
- **`engine.plan.parry`** (`engine/plan/parry.ts`) — the structural twin of `planShield`: reads `parryBonus()` off the effect stack (throws if the creature can't Parry), runs `assertReactionAvailable`, consumes the reaction (`economyConsumedIfEncountered`), and emits a pure-notification **`ParryUsed`** event with `preventedHit = triggeringAttackTotal < originalAC + acBonus`. The consumer drops the `DamageRolled` / `DamageApplied` chain when `preventedHit` is true (same contract as Shield's `ShieldCast`). No slot / resource.
- **Reaction-affordance descriptor** (`query/reactions.ts`) — `availableReactions` enumerates `parry` for a Parry monster, and `reactionsForTrigger` correlates a ready-to-dispatch `ParryIntent` from an `AttackRolled`, **melee-only** (`event.attackKind === 'melee'`) and offered only when +N could flip the hit (the structural filter, mirroring Shield's monster path). Monster-gated on `statblockId` so the effect-stack build is skipped for the common player path.

The see-attacker + wielding-a-melee-weapon gates stay consumer-side (vision / weapon facts the engine doesn't model — same posture as Shield's see-attacker).

### Content (each SRD-verified)

| Monster | CR | Parry |
|---|---|---|
| Bandit Captain | 2 | +2 |
| Knight | 3 | +2 |
| Warrior Veteran | 3 | +2 |
| Noble | ⅛ | +2 |
| Gladiator | 5 | +3 |

The audit row's "Bandit Captain" was correct: the SRD's "the bandit adds 2 to its AC" Parry sits on the **CR 2 Bandit Captain** statblock (Pistol + Scimitar, Multiattack "two attacks"), not the basic Bandit — verified by reading the statblock under the "## Bandits" header rather than the informal name in the reaction text. The "## Warriors" Parry is likewise the **CR 3 Warrior Veteran** (Greatsword + Heavy Crossbow), not the Infantry. **Erinyes (+4, CR 12)** and **Marilith (+5, CR 16)** carry Parry too but are out of scope.

## Docs / counts

New effect kind → **EFFECT_KINDS 69 → 70 (68 → 69 primitives)**; bumped the eight pinned citations (README ×3, status, architecture, api-overview, concepts, authoring-content-packs). No new condition.

## Tests

`tests/unit/engine/slice-831-monster-parry-reaction.test.ts` (7): the five statblocks carry `GrantParry` with the SRD bonus; the effect stack exposes `parryBonus()` (undefined for a non-Parry monster); `planParry` reports `preventedHit` true when +2 flips the hit and false when it can't (still emitting `ParryUsed`); it throws for a creature without Parry; `reactionsForTrigger` surfaces `parry` for a melee hit +2 would flip but not for a ranged attack or a non-flipping hit (and `availableReactions` enumerates it); and a second Parry the same round throws (reaction economy).

## Verification

`npx tsc --noEmit` clean (the new `ParryUsed` event forced the transcript exhaustive switch + the event union); planner-wiring + doc-counts green; `npm run test:fast` green (612 files, 4658 passed).
