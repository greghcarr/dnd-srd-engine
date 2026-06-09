# Slice 749 — deterministic reaction layer for the combat-fuzz driver (damage-mitigation cohort)

**Type:** Driver/infra (combat-fuzz). No engine primitive, no new event type, no new effect kind — pure composition of existing reaction planners. Mirrors the tactical-movement seam (slices 693-695/706).

## Why

The engine already resolves ~15 reaction-style actions deterministically, but `runBattle` (which dnd-web replays) only ever fired two: the inline Shield spell and tactical opportunity attacks. So the replay viewer never showed Uncanny Dodge, Deflect Attacks, etc. This adds a per-action **reaction-policy seam** that watches the events each action produces and fires the matching reaction planners, so dnd-web (opting in) renders a richer, fully-replayable combat.

## Scope: the damage-mitigation cohort

The fuzz commits each attack/cast→damage chain atomically (`performIntent`), so by the time the driver sees the events the effect already applied. Only the **compensating-event reactions** compose correctly post-hoc — their planner emits a `Healed` that nets the right HP after the damage. So this slice ships exactly those, on the `DamageApplied` window:

- **Uncanny Dodge** (Rogue L5) — halves the hit via a compensating `Healed`.
- **Deflect Attacks** (Monk L3) — reduces a B/P/S attack's damage via the slice-664 auto-`Healed`.
- **Stone's Endurance** (Goliath) — reduces damage by 1d12 + CON via a compensating `Healed`.

The "prevent-the-trigger" reactions (Shield, Cutting Words, Counterspell, Countercharm) need an engine-level pre-damage/pre-cast reaction window and are a deliberate follow-up. Under `reactions: 'auto'` the legacy inline Shield (which was already cosmetic-for-the-triggering-hit) is disabled so the only reactions firing are the correct damage-mitigation set; under the default `'none'` it fires exactly as before.

## What ships

- **Seam** ([scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts)): new `FuzzReactions = 'none' | 'auto'`, `reactions?` on `FuzzBattleOptions` (default `'none'`), `ReactionPolicy` / `ReactionPolicyContext` / `NO_REACTIONS` (mirrors `MovePolicy`). After each committed action the turn loop calls `reactionPolicy` with the exact slice of events that action produced; the inline Shield block is guarded on `reactions !== 'auto'`.
- **Pure decision logic** ([src/ai/reactions.ts](../../src/ai/reactions.ts) + [src/ai/reaction-constants.ts](../../src/ai/reaction-constants.ts), barrel-exported via [src/ai/index.ts](../../src/ai/index.ts)): `pickDamageReaction` + `hasUncannyDodge` / `hasDeflectAttacks` / `hasStonesEndurance`, with named constants (level gates, `REACTION_MIN_DAMAGE` threshold). RNG-free; a consumer can import these to preview reaction availability, same as the tactical policy.
- **Engine glue** ([scripts/reactions/reaction-policy.ts](../../scripts/reactions/reaction-policy.ts)): `makeAutoReactionPolicy` scans `DamageApplied` events, picks the single reaction per damaged combatant (deterministic priority; one per reactor per window), and fires it via `engine.plan.*` + `commit` in a try/catch (the engine enforces the one-reaction-per-round economy). Depth-bounded — reactions are not re-scanned for further reactions.

## Determinism & byte-identity

- No `Math.random` / `Date.now`; all dice come from the engine's seeded RNG via the planners.
- Default path (`reactions` omitted / `'none'`) is byte-identical to the pre-slice path: the only added code is an inert log-length snapshot, the `reactions !== 'auto'` guard around the existing Shield block (true by default), and a `NO_REACTIONS` identity call. The existing fuzz-matrix / goldens / replay-equivalence suites stay green unchanged.
- `reactions: 'auto'` is a new path: reactions fire, the log changes, and it carries its own tests. Replay-equivalence holds (the compensating `Healed` is a first-class event).

## Tests

- [tests/integration/fuzz-reactions-default-guard.test.ts](../../tests/integration/fuzz-reactions-default-guard.test.ts) — the default path fires no reaction events; explicit `'none'` normalized-equals the default; `'auto'` diverges (the seam is wired).
- [tests/unit/ai/reactions.test.ts](../../tests/unit/ai/reactions.test.ts) — the pure predicates + the `pickDamageReaction` priority cascade and threshold (10 tests).
- [tests/audit/fuzz-reactions-matrix.test.ts](../../tests/audit/fuzz-reactions-matrix.test.ts) — `reactions:'auto'` across seeds × shapes at L7: every battle completes + replays equivalently, and a positive-presence aggregate proves Uncanny Dodge AND Deflect Attacks actually fire.
- [tests/golden/s-reactions.test.ts](../../tests/golden/s-reactions.test.ts) — replay-equivalence + same-seed determinism + reactions fire on deterministic anchors (Uncanny Dodge: seed 10; Deflect Attacks: seed 2, both L7 1v1 PC) + default emits none. Behavioral golden (no transcript file), matching the s-tactical-movement precedent.

## Open follow-ups

- **Pre-damage/pre-cast reaction window** in the attack/spell pipeline, to land the prevent-the-trigger reactions (Shield reworked to actually prevent, Cutting Words, Counterspell, Countercharm) correctly.
- **Goliath giant-ancestry in the fuzz builder**: Stone's Endurance is wired and unit-tested but currently dormant in fuzz battles because the builder doesn't grant the giant-ancestry resource; it activates for free once that's wired.
- **dnd-web** opts in by passing `reactions: 'auto'` to `runBattle` (its own session; not an engine change).

## Verification

- `npx tsc --noEmit`: clean. New reaction tests: 20/20 green. Full `npx vitest run`: green, with zero pre-existing goldens/fuzz/replay tests changed (the default-off contract). No doc-counts impact (no new effect kinds / events / spells).
