# Slice 723 — engine: Fighter Tactical Shift (L5)

**Type:** Engine feature (planner rider). Additive; byte-identical for fighters below L5 and for out-of-encounter Second Wind. Wires the slice-54 Fighter L5 stub. L5 SRD-complete cycle.

SRD 5.2.1 Fighter L5 Tactical Shift: "Whenever you activate your Second Wind with a Bonus Action, you can move up to half your Speed without provoking Opportunity Attacks."

## What changed

`planSecondWind` now emits a Tactical Shift movement allowance when the fighter is level 5+ AND the bonus-action arm fires (in an active encounter, on the fighter's turn — the same condition that emits `ActionEconomyConsumed{bonusAction}`):

- A `Disengaged` event with `limitedToFeet = floor(effectiveSpeed / 2)` — the **same primitive as Rogue Withdraw / Cunning Strike**: the movement reducer stamps a `turnUsage.noProvokeMovementUpToFeet` high-water-mark that the move planner reads as a no-provoke distance budget. It does NOT set the full `disengaged` flag (it's a half-Speed window, not a whole-turn Disengage).

Out-of-encounter Second Wind (no bonus action) gets no Tactical Shift, per RAW ("with a Bonus Action"). Gated on fighter level ≥ 5; the pack's `tactical-shift` feature stays a marker (like Cunning Action / Sear Undead). No RNG drawn, so the heal roll is unchanged.

## Files

- [src/engine/plan/second-wind.ts](../../src/engine/plan/second-wind.ts): Tactical Shift `Disengaged{limitedToFeet}` in the bonus-action arm; uses `getEffectiveSpeed` (the `_content` param is now used).
- [tests/unit/engine/slice-545-second-wind.test.ts](../../tests/unit/engine/slice-545-second-wind.test.ts): +3 tests — L5 grants half-Speed (15 for Speed 30) no-provoke movement (`noProvokeMovementUpToFeet` after commit); L4 gets none; out-of-encounter gets none.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. Existing Second Wind tests byte-identical (gated on L5 + the bonus-action arm; no RNG change — the L5 heal roll is unchanged).

## Audit (Uncle Bob)

- **Reuse**: the half-Speed no-provoke window is the existing Withdraw primitive (`Disengaged{limitedToFeet}` → `noProvokeMovementUpToFeet`); no new movement mechanic.
- **SRD-faithful**: only on the bonus-action activation, up to half Speed, no-provoke (not a full Disengage).
- **Byte-identity**: gated on L5 + the bonus-action arm; sub-L5 and out-of-encounter Second Wind unchanged; no RNG drawn.
- **Pattern-check**: level-gate marker convention (Sear Undead / Cunning Action); feature row stays `effects: []`.
