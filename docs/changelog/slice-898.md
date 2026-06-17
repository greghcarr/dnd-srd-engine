# Slice 898 — SRD 16-hour Long Rest cadence (`long-rest-no-24h-lockout`) — Area 8 engine half closed

**Type:** Engine (new opt-in setting + campaign-state field + rest reducer/planner gate). Closes the L7 audit Area-8 quirk `long-rest-no-24h-lockout`. Area 8's only remaining open row is now the consumer-owned `no-group-check-helper`.

## RAW

The audit row's "no once-per-~24h cadence" cited the **2014** rule (one Long Rest per 24-hour period). SRD 5.2.1 (rules-glossary "Long Rest") is different: *"After you finish a Long Rest, you must wait at least 16 hours before starting another one."* The engine enforced no cadence at all — a character could Long Rest back-to-back.

## The fix

A Long Rest cadence is a **time** rule, and the engine's only time model is the consumer-driven clock `inGameTime.totalMinutes` (advanced via `InGameTimeAdvanced`; the engine never auto-advances — see [engine-scope.md](../engine-scope.md)). So the gate is **opt-in**:

- New `CampaignSettings.enforceLongRestCadence` (default **false**), toggled via the existing `CampaignSettingsChanged` event. Off by default because without a clock every rest sits at the same minute, so a default-on gate would reject the common rest-fight-rest loop for any consumer that doesn't track in-game time.
- New campaign-state record `lastLongRestEndMinutesByCharacter` (per-character in-game minute of last rest completion). `applyLongRestEnded` writes `inGameTime.totalMinutes` for each participant — always recorded (cheap; the gate only reads it when enforcement is on).
- `planLongRest`, when `enforceLongRestCadence`, rejects any participant whose recorded completion is within `16 * 60` in-game minutes of the current `inGameTime`, naming the creature and the remaining whole-hour wait. A participant with no recorded completion (never rested under tracking) is unrestricted, so the lockout is **per-character**.

The consumer owns advancing `inGameTime` across the rest's own 8-hour duration; the engine enforces the 16-hour minimum from the recorded completion. With the flag off, the gate is inert — every existing rest path is byte-unchanged.

## Pattern-check

The cadence reads three pieces of state (`settings.enforceLongRestCadence`, `inGameTime`, `lastLongRestEndMinutesByCharacter`) — all already on `CampaignState`; no Character-schema change (so none of the non-`.parse()` Character literals are touched, unlike slice 887). The new state field carries a `.default({})`, and a grep confirms no hand-built `CampaignState` literal bypasses `emptyCampaignState()`/`.parse()`, so re-hydrated and fresh campaigns both get it. Short Rest has no analogous cadence in the SRD (the 2024 once-per-day Short-Rest cap is a *Gritty Realism* variant, out of core scope), so only the Long Rest planner is gated.

## Tests

New `tests/unit/engine/slice-898-long-rest-cadence.test.ts` (5 tests): cadence OFF → back-to-back rests at the same in-game time both succeed (opt-in, non-breaking); cadence ON → a second rest within 16h throws naming the creature; at exactly 16h it succeeds (>= boundary); one minute short still throws; the lockout is per-character (a never-rested member can rest while another is locked out).

## Counts

No count change — no new condition / effect / spell / feat / event type (the existing `CampaignSettingsChanged` carries the new optional flag).

## Audit

- Struck `long-rest-no-24h-lockout` (correcting the 2014→2024 framing); Rollup: **Area 8** `2 → 1` open / `12 → 13` closed (`0/0/2 → 0/0/1`, owner now Consumer); **Total** `21 → 20` open / `96 → 97` closed / `0/7/14 → 0/7/13`. Header notes Area 8's engine work is done (last open row is a consumer helper). [engine-scope.md](../engine-scope.md) in-game-time bullet documents the opt-in cadence.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (669 files, 4954 passed / 165 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
