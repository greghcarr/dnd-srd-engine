# Slice 740 — engine: Bard Countercharm (L7)

**Type:** Engine feature (new outcome planner). Additive. Wires the Bard L7 stub. L7 SRD-complete cycle.

SRD 5.2.1 Bard L7 Countercharm: "If you or a creature within 30 feet of you fails a saving throw against an effect that applies the Charmed or Frightened condition, you can take a Reaction to cause the save to be rerolled, and the new roll has Advantage."

## What changed

- New planner **`engine.plan.countercharm(state, { bardId, targetId, ability, dc, saveBonus })`** → `{ events, d20, total, success }` (the Peerless Skill / Hero Points outcome shape). It rerolls the failed creature's save as 2d20 take-max + the original `saveBonus`, emits the rerolled `SaveRolled` (`used: 'advantage'`), and returns whether the new total meets the `dc`. Gated on Bard level ≥ 7 (free Reaction — no resource spent).
- Pack: Bard L7 `countercharm` gains `Custom { handlerId: 'countercharm' }` (the planner-backed-marker convention shared by Cutting Words / Peerless Skill).
- Wired into `engine.plan` + the `performIntent` dispatch (`Countercharm`), so the planner-wiring audit sees it as dispatched (mirror of `peerlessSkill`).

## Consumer-managed (by design)

Consistent with the engine's reaction philosophy (Cutting Words, Peerless Skill, Uncanny Dodge all return an outcome the consumer applies) and its no-positions stance: the **30-ft range**, the **self-or-ally** choice of who to protect, the **Reaction** economy, and **removing the Charmed/Frightened condition** the original failed save already applied (on a successful reroll) are the consumer's to enforce. The engine performs the reroll-with-Advantage math and reports the result.

## Files

- [src/engine/plan/countercharm.ts](../../src/engine/plan/countercharm.ts) (new): `planCountercharm`.
- [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts), [src/engine/conveniences.ts](../../src/engine/conveniences.ts): export + `engine.plan.countercharm` + `Countercharm` dispatch entry.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Bard L7 `countercharm` → `Custom { handlerId: 'countercharm' }`.
- [tests/unit/engine/slice-740-countercharm.test.ts](../../tests/unit/engine/slice-740-countercharm.test.ts) (new): marker presence; rerolls an ally's save with Advantage (2d20 take-max + bonus vs DC); works self-targeted; a L6 bard throws.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. planner-wiring audit green (dispatched). No new effect kind (no doc-counts change); features coverage snapshot adds `bard L7 countercharm`.

## Audit (Uncle Bob)

- **Reuse**: the outcome-planner shape mirrors `planPeerlessSkill` / `planDarkOnesOwnLuck`; the marker convention mirrors the other bard reactions.
- **SRD-faithful**: reroll with Advantage, free Reaction, applies to a Charmed/Frightened save of self or a nearby creature.
- **Effect-driven seam**: gated on Bard L7 with a `Custom` marker on the feature (the planner-backed-reaction convention); range/economy/condition-removal stay consumer-side per the engine's reaction + no-positions model.
