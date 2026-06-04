# Slice 634 — engine: Fighter L2 Tactical Mind planner

**Type:** Engine primitive + canonical user.

Closes the first of five L2-complete punch-list items from slice 633. RAW (SRD 5.2.1 Fighter L2): "When you fail an ability check, you can expend a use of your Second Wind to push yourself toward success. Rather than regaining Hit Points, you roll 1d10 and add the number rolled to the ability check, potentially turning it into a success. If the check still fails, this use of Second Wind isn't expended."

`planTacticalMind` is the self-targeted mirror of slice 358's `planPeerlessSkill` (Bard College of Lore L14): failed check + threshold in, rolled die + `turnedSuccess` out, resource consumed only when the boost turns the failure into a success.

## Files

- **[../../src/engine/plan/tactical-mind.ts](../../src/engine/plan/tactical-mind.ts)** (new): the planner, intent type, outcome type. Rolls 1d10 against `state` + `intent.originalRollTotal` + `intent.threshold`; gates on Fighter L2+ enrollment and ≥1 Second Wind use available. Emits one `ResourceSpent` for `second-wind` only when `turnedSuccess === true`. No `ActionEconomyConsumed` (RAW: not an action / bonus action / reaction).
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planTacticalMind`, `TacticalMindIntent`, `TacticalMindOutcome`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: import + add `engine.plan.tacticalMind(state, intent)` method (returns `TacticalMindOutcome`, matching `peerlessSkill`'s outcome-returning shape).
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: add `TacticalMind: (i) => engine.plan.tacticalMind(campaign.state, i)` to the `performIntent` dispatch (player-action shape, mirroring PeerlessSkill). Required by the slice-NNN planner-wiring audit which forces every `engine.plan` method into either dispatch or the EXCLUDED_FROM_DISPATCH allowlist.
- **[../../src/engine/plan/second-wind.ts](../../src/engine/plan/second-wind.ts)**: replaced stale "L7 Tactical Mind extension" comment with a correct "L2, see planTacticalMind" pointer (2024 PHB moved Tactical Mind from a 2014 L7+ Battlemaster feature to base Fighter L2; the comment had not caught up).
- **[../../tests/unit/engine/slice-634-tactical-mind.test.ts](../../tests/unit/engine/slice-634-tactical-mind.test.ts)** (new): 4 tests — near-miss boost spends the use, failed-after-boost doesn't, gating rejects (non-fighter / under L2 / no uses), no ActionEconomyConsumed emitted.
- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**: flipped `planTacticalMind` from the xfail block to the wired block. Floor still 32/32; xfail count drops 5 → 4.

## Tests

- `npx vitest run tests/unit/engine/slice-634-tactical-mind.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (10 planners wired + 4 xfails remaining).
- Full suite: 503 files / 3410 passing + 173 skipped (was 502 / 3406 pre-slice; +1 file, +4 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**RNG impact (additive, no shift for existing consumers).** Consumers who explicitly invoke `engine.plan.tacticalMind` now consume one d10 from the RNG stream per invocation. No existing path calls it; the planner is opt-in. A campaign with no Tactical Mind invocations replays byte-for-byte against pre-slice transcripts.

**No breaking change.** The fighter L2 content row is unchanged (the `tactical-mind` feature already shipped with `effects: []`; mechanical wiring is now via the planner instead of declarative effects, mirroring how Second Wind / Action Surge / Cutting Words / Peerless Skill all work). No API removed or renamed.

## Audit (Uncle Bob)

- **Names**: `planTacticalMind`, `TacticalMindIntent`, `TacticalMindOutcome`, `engine.plan.tacticalMind` — matches the `planPeerlessSkill` family verbatim. Constants `FIGHTER_CLASS_ID`, `SECOND_WIND_RESOURCE`, `TACTICAL_MIND_LEVEL`, `TACTICAL_MIND_DIE_SIDES` named for what they are, not for where they're used.
- **DRY**: planner body is structurally identical to `planPeerlessSkill` (read actor → gate on class + level + resource → roll → conditional spend). The duplication is intentional: each feature owns its own gate text and resource id, and a "generic boost planner" would obscure the per-feature RAW deviations (Peerless Skill spends a scaling BI die; Tactical Mind always 1d10). When a third boost-after-fail planner lands, consider extracting; with two, the abstraction is premature.
- **SRP**: planner does one thing (roll-and-maybe-spend); test file does one thing (lock the four observable behaviors); the audit-flip is a separate file edit. No section does anyone else's job.
- **Magic numbers / strings**: every literal is a named constant. The single magic literal in the test file is `original 14 / threshold 15` — a deliberate "fail by 1" scenario, not a tunable.
- **Pattern-check**: searched the codebase for other "spend resource to boost a failed check" planners. `planPeerlessSkill` is the only sibling and follows the same shape (matched). Cleric L17 Improved Blessed Strikes uses a different shape (on-hit damage rider, not failed-check boost) — not a candidate.

## Open follow-ups

L2-complete punch list now stands at **4 remaining** (was 5):

- ~~`planTacticalMind`~~ — landed.
- **`planDivineSpark`** — L2 Cleric Channel Divinity option.
- **`planUncannyMetabolism`** — L2 Monk on-initiative HP + Ki regain.
- **`planMagicalCunning`** — L2 Warlock Pact slot regain.
- **Eldritch Invocations catalog** — `pack.eldritchInvocations ≥ 3`.

When the remaining four flip, tag `0.3.0-alpha.0` ("L2 SRD complete").
