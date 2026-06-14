# Slice 862 — a creature must have at least 1 HP to start a Long Rest

**Type:** Engine fix (no content). Closes the [L7 audit](../l7-completion-audit.md) Area-8 quirk `rest-no-min-1hp`.

## The divergence

RAW (SRD 5.2.1, Long Rest):

> _Benefits of the Rest._ **To start a Long Rest, you must have at least 1 Hit Point.** When you finish the rest, you ... Regain All HP ...

`planLongRest` applied the rest's benefits to every participant unconditionally, so a creature at **0 HP** (dying, or stable-but-unconscious) could long-rest straight to full — skipping the death-save / heal loop the rules require.

## The fix

A gate at the top of `planLongRest`: if any participant is below 1 HP, it throws, naming the creature —

```
<Name> cannot start a Long Rest at 0 Hit Points (RAW requires at least 1 Hit Point to start a Long Rest)
```

The creature must regain at least 1 HP first — a heal (Cure Wounds, Healing Word, Lay on Hands, a potion) or the stable-creature "regains 1 HP after 1d4 hours" recovery. This is **explicit failure over the prior silent rest-to-full**, matching the engine's preference for visible input violations. The gate lives in the **planner** (not the reducer the audit row cited) so the rejection surfaces before any event commits.

For a party rest, the throw is per-participant (the first sub-1-HP member trips it). RAW is per-creature: a dying member can't take the rest, so the consumer either excludes them or heals them to ≥1 HP before resting the group.

## What shipped

New 3-test `tests/unit/engine/slice-862-long-rest-min-1hp.test.ts`: a Long Rest with a 0-HP participant throws (`/at least 1 Hit Point/`); a participant with ≥1 HP rests normally (`LongRestStarted` + `LongRestEnded` emitted); and a party rest with one 0-HP member is rejected, naming them. Every existing long-rest test stays green — none rested a downed creature.

## Verification

`npx tsc --noEmit` clean; new 3-test slice-862 green; the s1-long-rest golden + the heroic-inspiration / boots-of-speed / cast-spell long-rest tests unchanged. No content / condition / coverage-snapshot change. `npm run test:fast` (640 files, 4811 passed) + doc audits green.
