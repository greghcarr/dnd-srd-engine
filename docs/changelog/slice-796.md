# Slice 796 — Guiding Bolt's advantage grant

**Type:** Content (a new condition + a spell wiring) + a one-spot engine fix. **Closes** the [L7 audit](../l7-completion-audit.md) Area 2 divergence `guiding-bolt-no-advantage-grant`.

## The gap

Guiding Bolt was wired as a flat `4d6` radiant ranged spell attack — missing its **defining** rider. RAW (SRD 5.2.1): *"On a hit, the target takes 4d6 Radiant damage, and the next attack roll made against it before the end of your next turn has Advantage."* The advantage grant — the whole reason a party Cleric opens with Guiding Bolt — did nothing.

## The fix

- **New `guiding-bolt-glow` condition** — `GrantAdvantageToAttackers` + `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }`, the same 1-round window shape `color-sprayed-blinded-active` uses (the encounter sweep keys on `sourceCharacterId`, so it lifts at the end of the source caster's next turn). Applied via the attack mechanic's existing `conditionOnHit` field (the same field Ray of Enfeeblement uses), so it lands only on a hit.
- **Engine fix (`cast-spell.ts`):** the attack-mechanic `conditionOnHit` path stamped `sourceCharacterId` (for concentration cleanup) but **not** the rider's declarative `autoExpiry` — unlike the save / buff condition paths. A non-concentration on-hit rider therefore never lifted. Added the autoExpiry stamping (compute `expiresOnRound`/`expiryTrigger` from the condition def + the active encounter round). Ray of Enfeeblement is unaffected (it's a concentration rider with no autoExpiry).

## Known RAW deviation (noted on the condition)

RAW grants Advantage to the **next** attack only; the engine grants it to attackers throughout the 1-round window — there is no "consume on first attack" machinery. This over-grants only when the target is attacked more than once before the caster's next turn ends, and it trades a hard divergence (no advantage at all) for a soft one. Strict "next attack only" consume is a possible future primitive.

## Pattern-check

The `pack-integrity` reachability walker collected condition references from `conditionId` / `conditionOnFail` / `conditionOnSuccess` / `applyConditionId` / `bearerConditionId` / `allyConditionId` but **not** `conditionOnHit` — so `enfeebled` (also a `conditionOnHit` rider) only passed the orphan check incidentally via a source-text match. Added `conditionOnHit` to the walker (the documented "under-walking-references" failure mode), so any attack-spell on-hit condition is recognized as reachable.

## Tests

`tests/unit/engine/slice-796-guiding-bolt-advantage.test.ts` (4): the pack shape (mechanic `conditionOnHit` + the glow's effect/expiry); a cast in an encounter applies the glow on a hit **with** the 1-round `turnEnd` expiry stamped (the engine fix); and a target carrying the glow grants a subsequent attacker Advantage (2 d20s, `used: 'advantage'`). Coverage snapshot: +`guiding-bolt-glow`. Conditions count 160 → 161.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green.
