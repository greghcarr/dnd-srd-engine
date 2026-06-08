# Slice 750 — attack pre-damage reaction window (Shield + Cutting Words)

**Type:** Driver/infra (combat-fuzz). No engine change — pure consumer-driven composition of existing planners. Companion to slice 749's post-commit damage-mitigation layer.

## Why

Slice 749 could only ship the reactions that compose correctly *after* the damage commits (Uncanny Dodge / Deflect Attacks / Stone's Endurance, via a compensating `Healed`). The **prevent-the-trigger** reactions (Shield, Cutting Words) need a window *between* the attack roll and the damage. This opens that window in the fuzz driver so those reactions genuinely cancel the hit, giving the dnd-web replay viewer real defensive reactions.

## How (no engine change)

`engine.plan.attack` returns the event list and the consumer chooses what to commit — the documented pattern (per [plan-shield.test.ts](../../tests/unit/engine/plan-shield.test.ts), [plan-cutting-words.test.ts](../../tests/unit/engine/plan-cutting-words.test.ts)): commit the attack's pre-damage events, and on a reaction's `preventedHit` omit the damage chain. So this is a **driver-side two-phase flow**, gated behind `reactions: 'auto'`:

1. Plan the attack uncommitted (`planIntent(engine.plan, state, intent)`).
2. On a hit, run a deterministic **Shield → Cutting Words** cascade against the still-uncommitted state.
3. Commit the full attack, or — if a reaction prevented the hit — the attack **minus its damage chain**.

`planAttack` front-loads the attacker's `ActionEconomyConsumed` (`[...economyPrelude, ...resolution, ...tail]`), so the slice rule is: **keep everything before the first damage event (`DamageRolled` or `DamageApplied`), plus any `WeaponLoaded`**, and drop the rest. Keying on *either* damage event matters — a rider (e.g. a radiant smite) can emit `DamageApplied` with no preceding `DamageRolled`, which a `DamageRolled`-only rule would miss (a bug caught during implementation: 3 "shielded" hits still dealt damage until the boundary was widened).

A reaction's planner is called speculatively against the uncommitted state and its events are committed only if it prevents — so a speculative Shield that wouldn't help spends no slot (Shield rolls no dice, so the speculation is RNG-safe; Cutting Words rolls its die and is committed either way, since Bardic Inspiration is spent on use per RAW).

## Reactions wired

- **Shield** — the attack's target (Wizard/Sorcerer with `shield` prepared) casts it when `+5 AC` would convert the hit to a miss (`total < targetAC + 5`).
- **Cutting Words** — a Bard on the target's team reduces the attacker's roll when a max Bardic Inspiration die could drop it below AC.

Under `reactions: 'auto'` the slice-749-disabled cosmetic inline Shield is superseded by this real one; under `'none'` the legacy inline Shield still fires and the path is byte-identical to pre-slice. The slice-749 post-commit mitigation layer still runs after every commit, so a hit that *isn't* prevented can still be mitigated (Uncanny Dodge etc.) — the two windows compose.

## Files

- `scripts/reactions/pre-damage-policy.ts` — NEW. The two-phase resolver: the Shield/Cutting-Words cascade + the damage-chain slice rule.
- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — action-loop branch routing `'auto'` Attack intents through the resolver (`planIntent` to plan uncommitted).
- [src/ai/reactions.ts](../../src/ai/reactions.ts) + [reaction-constants.ts](../../src/ai/reaction-constants.ts) + [src/ai/index.ts](../../src/ai/index.ts) — `shouldShield` / `shouldCuttingWords` + `SHIELD_AC_BONUS` etc. (barrel-exported; `bardicInspirationDieFor` reused from the engine).
- `scripts/reactions/reaction-policy.ts` — exported `reactionAvailable` for reuse.

## Tests

- [tests/unit/ai/reactions.test.ts](../../tests/unit/ai/reactions.test.ts) — `shouldShield` (fires only when `+5` would miss + class/prepared gate) and `shouldCuttingWords` (could-prevent heuristic, miss/no-BI/non-Bard cases).
- [tests/audit/fuzz-reactions-matrix.test.ts](../../tests/audit/fuzz-reactions-matrix.test.ts) — under `'auto'`, Shield fires and **genuinely prevents** (no `DamageApplied` to the caster on the shielded swing) and the sliced-attack log replays equivalently.
- [tests/golden/s-reactions.test.ts](../../tests/golden/s-reactions.test.ts) — Shield prevents on a deterministic anchor (seed 6, L5, 2v2 PC); Cutting Words fires on its anchor (seed 7, L3, 2v2 PC); replay-equivalence holds.

The load-bearing check is replay-equivalence on the sliced commits (an `AttackRolled` with no damage chain must rebuild the exact state). No existing goldens/fuzz change (default path untouched); no doc-counts impact.

## Open follow-ups

- `AttackRolled.hit` stays `true` on a prevented hit (a `ShieldCast` / Bardic spend documents it), and a Cutting-Words-induced miss doesn't synthesize on-miss effects (e.g. Graze) — the limits of driver-side slicing vs a full engine two-phase attack API (the clean fix if RAW-perfect transcripts / interactive consumers need it).
- Counterspell (spell-cast window — needs splitting `planCastSpell`'s effect events), Countercharm (save window), Protection (needs positions).

## Verification

`npx tsc --noEmit` clean. New reaction tests green. Smoke over 480 `'auto'` battles: Shield prevented 62 hits, **0** leaked damage, **0** replay mismatches. Full `npx vitest run`: green, zero pre-existing tests changed (default-off contract).
