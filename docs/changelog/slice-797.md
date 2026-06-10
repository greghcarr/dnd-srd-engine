# Slice 797 — cantrip on-hit riders: Ray of Frost slow + Chill Touch anti-heal

**Type:** Content (two new conditions + two spell wirings). **Closes** two [L7 audit](../l7-completion-audit.md) Area 2 quirks: `ray-of-frost-no-slow`, `chill-touch-no-anti-heal`.

## The gaps

Two damage cantrips shipped their damage but dropped their RAW on-hit rider:

- **Ray of Frost** (SRD 5.2.1): *"its Speed is reduced by 10 feet until the start of your next turn."* Wired as flat 1d8 cold.
- **Chill Touch** (SRD 5.2.1): *"it can't regain Hit Points until the end of your next turn."* Wired as flat 1d10 necrotic.

## The fix

Both ride the attack mechanic's existing `conditionOnHit` field (the slice-796 path that stamps a rider's `autoExpiry` so a non-concentration on-hit condition self-lifts), each reusing a pre-existing effect primitive:

- **`ray-of-frost-slowed`** — `ModifySpeed { walk, add, -10 }` + `autoExpiry { afterRounds: 1, trigger: 'turnStart' }` (lifts at the start of the caster's next turn — exactly the RAW window). Mechanically identical to the Goliath `frosts-chill-slowed` rider; kept as a dedicated, source-named variant per the per-source convention (color-spray / sleep / guiding-bolt all got their own).
- **`chill-touched-no-heal`** — `BlockHealing` + `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }` (end of the caster's next turn — the guiding-bolt-glow / color-spray window). Distinct from `healing-blocked-active` (the no-autoExpiry Spirit Shroud variant) precisely because it carries its own self-lifting window.

The `ModifySpeed` and `BlockHealing` effects are pre-existing, separately-tested primitives — this slice wires + meters them onto the two cantrips.

## Scope note — Shocking Grasp deferred

The third cantrip rider in this cluster, **Shocking Grasp** (*"can't make Opportunity Attacks until the start of its next turn"*), was held back: there is **no** "prevent opportunity attacks" effect primitive (the `isOpportunityAttack` fact only *gates* other arms; nothing suppresses the bearer's OA reaction). That needs a new effect kind + a gate in the OA reaction planner — an M engine slice, not a content add. The audit row `shocking-grasp-no-oa-denial` is re-tagged M and kept open.

## Tests

`tests/unit/engine/slice-797-cantrip-riders.test.ts` (4): the pack shape for each (mechanic `conditionOnHit` + the condition's effect/expiry); and an encounter cast for each where a hit applies the rider with its autoExpiry stamped (`ray-of-frost-slowed` → round+1 / turnStart; `chill-touched-no-heal` → round+1 / turnEnd). Coverage snapshot: +2 conditions. Conditions count 161 → 163.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green.
