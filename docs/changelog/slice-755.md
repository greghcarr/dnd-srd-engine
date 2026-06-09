# Slice 755 — re-wire the combat-fuzz pre-damage reactions to the two-phase attack API

**Type:** Driver/infra (combat-fuzz). Consumes the slice-754 engine two-phase attack API. No engine / pack / AI change; only the `reactions:'auto'` driver path changes.

## Why

Slices 750-753 opened the pre-damage reaction window by planning a *full* attack (roll + damage) and then **slicing off** the damage chain (`dropDamageChain`) when a reaction prevented the hit. The committed log was correct, but the damage dice were still rolled and the on-hit riders still computed — then discarded — and the discarded roll advanced the RNG stream. Slice 754 gave the engine a first-class `attackRoll` → `attackDamage` seam; this slice re-wires the fuzz onto it so a prevented attack **never rolls damage at all**.

## How

`resolveAttackWithReactions` ([scripts/reactions/pre-damage-policy.ts](../../scripts/reactions/pre-damage-policy.ts)) now takes the attack **intent** (not pre-planned events):

1. `engine.plan.attackRoll(state, intent)` → `{ events: rollEvents, roll }` (uncommitted).
2. **Miss** (or no roll): commit `rollEvents + attackDamage(roll).events` (on a miss, `attackDamage` contributes only the loading-weapon tail — no damage rolled). Byte-identical to the bundled attack on a miss.
3. **Hit**: run the fixed Shield → Protection → Cutting Words cascade (decision logic unchanged — Shield/Protection/Cutting-Words still read `AttackRolled.total` / `targetAC` / `d20`).
   - **Prevented** (Shield converts the hit, Protection's disadvantage reroll flips it, Cutting Words drops it below AC): commit `rollEvents + roll.tail + reactionEvents`. **`engine.plan.attackDamage` is never called** — no damage dice, no on-hit riders, no discarded RNG.
   - **Reaction fired but the hit stands** (non-flip Protection / non-prevent Cutting Words, reaction spent RAW): commit `rollEvents + attackDamage(roll).events + reactionEvents`.
   - **No reaction**: commit `rollEvents + attackDamage(roll).events` (the full attack).

`engine.plan.attackDamage(roll)` consumes the damage RNG, so it is invoked **at most once** per attack, only on a path that actually deals damage. `dropDamageChain` is deleted (slicing is no longer needed — the damage simply isn't planned). The action-loop Attack branch ([scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts)) passes the intent (no `planIntent` pre-plan).

## Determinism

- **`reactions:'none'` is unaffected** (this resolver is auto-only; the default path is untouched and stays byte-identical to the pre-slice path — the engine goldens + default-guard prove it).
- **`reactions:'auto'`** changes for any battle where a reaction prevents a hit: the discarded damage roll no longer advances the stream, so subsequent rolls shift. This is the intended behavior change; the reaction layer stays fully deterministic and replay-equivalent (two same-seed `'auto'` runs are still identical; every reacting log still replays to its state). The existing behavioral anchors (Shield seed 6 / Counterspell seed 16 / Cutting Words seed 7 / Countercharm seeds / Uncanny Dodge / Deflect Attacks) still fire — they assert presence over whole battles, robust to the stream shift, so no anchor seeds moved.

## Files

- [scripts/reactions/pre-damage-policy.ts](../../scripts/reactions/pre-damage-policy.ts) — resolver takes `attackIntent`; uses `attackRoll` / `attackDamage`; `dropDamageChain` removed; `roll.tail` emitted on a prevent.
- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — the `'auto'` Attack branch passes the intent (no pre-plan).

## Tests

- [tests/audit/fuzz-reactions-matrix.test.ts](../../tests/audit/fuzz-reactions-matrix.test.ts) — NEW slice-755 block: a Shield-prevented swing rolls **no `DamageRolled` at all** (the damage phase is skipped, not sliced) — the slice-specific regression guard. The slice-750 block (no `DamageApplied` to the caster) + replay-equivalence stay green.
- [tests/unit/reactions/protection-resolver.test.ts](../../tests/unit/reactions/protection-resolver.test.ts) — reworked for the new signature: the attacker makes a real ranged (shortbow) attack on its turn via the two-phase API; the test reads the actual `AttackRolled` + `ProtectionUsed` and asserts the prevent-iff-flip invariant + replay-equivalence, and that an out-of-range protector does not react.
- [tests/golden/s-reactions.test.ts](../../tests/golden/s-reactions.test.ts) + [tests/integration/fuzz-reactions-default-guard.test.ts](../../tests/integration/fuzz-reactions-default-guard.test.ts) — unchanged, still green (anchors robust; `'none'` byte-identical).

Full `npx vitest run` green.

## Status

Completes the engine two-phase attack work (754 + 755). The combat-fuzz reaction layer now uses the engine's first-class roll → damage seam end-to-end; a prevented attack costs no damage roll. No deferred follow-ups from this strand.
