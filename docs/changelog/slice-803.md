# Slice 803 — Grapple / Shove RAW gates

**Type:** Engine planner validation. **Closes** the [L7 audit](../l7-completion-audit.md) Area 4 divergence `grapple-shove-missing-gates`.

## The gap

`planGrapple` / `planShove` rolled the target's save but skipped the RAW preconditions, so a Stunned Medium PC could grapple a Gargantuan dragon while wielding a greatsword. RAW (rules-glossary.md "Unarmed Strike"):

- **Grapple:** *"possible only if the target is no more than one size larger than you and if you have a hand free to grab it."*
- **Shove:** *"possible only if the target is no more than one size larger than you."* (No free-hand requirement.)
- Both are Unarmed Strike options under the Attack action, so the actor must be able to act.

## The fix

Three gates added to `src/engine/plan/contested.ts`, reusing existing helpers:

- **Actor can act** — `assertActorCanAct(attacker, 'grapple' | 'shove')` (the shared incapacitated/stunned/paralyzed gate every other action planner uses).
- **Size** — `assertTargetNotTooLarge`: `SIZES.indexOf(creatureSize(target)) − SIZES.indexOf(creatureSize(attacker)) > 1` throws. Applied to both grapple and shove.
- **Free hand** (grapple only) — `attackerHasFreeHand`: a two-handed weapon in the main hand occupies both hands; otherwise a hand is free unless main-hand + (off-hand or shield) are both occupied. Monsters with empty equip slots (or a lone natural weapon) keep a free appendage.

## Tests

`tests/unit/engine/slice-803-grapple-shove-gates.test.ts` (6): a Stunned attacker can't grapple or shove; neither can target a creature more than one size larger (Medium→Huge); a Medium attacker *can* grapple a Large target (exactly one larger); a two-handed wielder is blocked from grappling (no free hand) but *can* still shove (no free-hand requirement); and a clean empty-handed Medium-vs-Medium grapple still rolls the save.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (585 files, 4512 passed) — no existing grapple/shove scenario (all clean Medium-vs-Medium, free-handed) regressed.
