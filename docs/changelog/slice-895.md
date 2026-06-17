# Slice 895 — Chromatic Orb's leap (`chromatic-orb-no-leap`) — Area 2 fully closed

**Type:** Engine (spell-attack loop → target queue) + schema flag + `CastSpellIntent` field + content. Closes the L7 audit Area-2 quirk `chromatic-orb-no-leap`. **Area 2 (Spell mechanics L0-4) is now fully closed.**

## RAW

Chromatic Orb: *"On a hit, the target takes 3d8 damage of the chosen type. If you roll the same number on two or more of the d8s, the orb leaps to a different target of your choice within 30 feet of the target. Make an attack roll against the new target, and make a new damage roll. The orb can't leap again unless you cast the spell with a level 2+ spell slot."* Upcast: *"the orb can leap a maximum number of times equal to the level of the slot expended, and a creature can be targeted only once by each casting."*

## The fix

- New opt-in **`leapsOnMatchingDamageDice`** flag on the attack mechanic (set on chromatic-orb) + **`CastSpellIntent.leapTargetIds`** (ordered, consumer-supplied — the leap target is "of your choice within 30 ft," a positional fact the engine doesn't own).
- The spell-attack loop in `planAttackMechanic` became a **target queue** instead of a fixed `for`-over-`attackTargetIds`. After a target's damage resolves, a HIT whose **base d8s** show 2+ equal values appends the next leap target to the queue — yielding a fresh attack roll + damage roll there, exactly as RAW requires.
- **Budget:** `maxLeaps = slotLevel` (level 1 → 1 leap; "can't leap again" at level 1). Each creature is targeted at most once per casting (the leap-target selection skips an already-hit creature). When the consumer offers no/insufficient leap targets, the leap simply doesn't happen (graceful). With the flag off, the queue is exactly `attackTargetIds` — every other attack spell is byte-unchanged.

The matching check is on `baseRolls` (the 3d8 + any upcast d8s); cantrip-scaling / exploding dice aren't part of "the d8s" per RAW, and chromatic-orb has neither.

## Pattern-check (the refactor's blast radius)

Converting the `for`-over-targets to a `while`-over-queue initially deduped base targets — which broke **multi-beam** spells (Eldritch Blast fires several beams at the *same* target). Fixed by scoping the each-creature-once rule to **leap-target selection only**, not the base targets; the full fast suite then stayed green. "Each creature once" is a chromatic-orb-leap rule, not a general one.

## Tests

New `tests/unit/engine/slice-895-chromatic-orb-leap.test.ts` (4 tests, seed-searched for matching / distinct d8 rolls): leaps to the next target on a hit with 2+ matching d8s (a fresh attack + damage at the leap target); does NOT leap when the d8s are all distinct (only the primary is attacked); does not leap when no leap targets are supplied (graceful); at slot level 1 the orb leaps at most once (the second leap target is never attacked — the budget cap).

## Counts

No count change — chromatic-orb was already wired (attack mechanic); `leapsOnMatchingDamageDice` is a new field on the existing attack-mechanic schema (not a new mechanic kind / condition / effect), and `leapTargetIds` is a plain `CastSpellIntent` input.

## Audit

- Struck `chromatic-orb-no-leap`; Rollup: **Area 2** `1 → 0` open / `23 → 24` closed → ✅ **fully closed**; **Total** `23 → 22` open / `94 → 95` closed / `0/7/16 → 0/7/15`. Header now reads "Areas 1, 2, 4, 6, and 7 are fully closed."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (667 files, 4945 passed / 165 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
