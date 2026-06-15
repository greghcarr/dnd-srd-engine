# Slice 879 — Reaction reset timing (per-turn, not per-round)

**Type:** Engine (encounter reducer). Closes the L7 audit Area-4 quirk `reaction-reset-timing`.

## RAW

rules-glossary "Reaction": *"You can take a Reaction on another creature's turn, and if you take it on your turn, you can do so even if you also take an action, a Bonus Action, or both. **Once you take a Reaction, you can't take another one until the start of your next turn.**"*

The recharge is anchored to the **start of the reactor's own next turn** — a per-TURN cadence, not per-ROUND.

## What was wrong

The engine reset `reactionUsedThisRound` for **every** combatant at once in `applyRoundEnded`. For a combatant whose next turn isn't first in the new round, that refreshed its reaction a beat **too early**: it could react during earlier combatants' round-N+1 turns even though, RAW, its reaction shouldn't recharge until its own round-N+1 turn began. The round-end reset also:

- ignored initiative swaps (a reorder mid-combat doesn't change "the start of *your* next turn"), and
- missed extra turns (a feature granting an extra turn should recharge the reaction at that turn's start), and
- hid the legitimate nuance that a creature reacting **before** its turn gets the reaction back **at** its turn, so it can react again later that same round.

## The fix

- **`applyTurnStarted`** now resets `active.turnUsage.reactionUsedThisRound = false` for the combatant whose turn is starting — the RAW per-turn recharge. An extra turn / reordered initiative carries its own `TurnStarted`, so the timing follows automatically.
- **`applyRoundEnded`** no longer resets the reaction flag (it still resets `hasActedThisRound`, which is genuinely per-round).

Dropping the round-end reset is safe: `applyRoundEnded`'s invariant requires `activeIndex >= combatants.length` (all combatants have acted), and a `TurnEnded` is always preceded by that combatant's `TurnStarted` — so **every** combatant gets exactly one `TurnStarted` per round, which reliably recharges its reaction. No combatant can strand a stale `true`.

The field keeps its historical name `reactionUsedThisRound` (renaming would touch 20+ read sites across planners, the query/affordances layer, fuzz harnesses, and property tests for no behavioral gain). Its semantics are now documented in-reducer as per-turn ("used since the start of my current turn"), and the QUIRK was about **timing**, not naming.

## Tests

- New `tests/unit/engine/slice-879-reaction-reset-timing.test.ts` (5 reducer-level tests): a reaction taken before the reactor's own turn recharges *at* that turn (and a *different* combatant's `TurnStarted` doesn't recharge it); the same combatant can react twice in one round across its own turn boundary (the per-turn, not per-round nuance); a reaction spent late stays spent through `RoundEnded` until the reactor's next turn; combatants recharge **independently** at their own turns (A recharges at round-2 start, C — last in initiative — does not until its round-2 turn); an un-reacted combatant stays available.
- Updated `tests/unit/reducers/action-economy.test.ts`: the old *"RoundEnded resets reactionUsedThisRound for everyone"* test asserted the pre-879 behavior — rewritten to assert the new semantics (a spent reaction persists through `RoundEnded`, recharges at the combatant's own next `TurnStarted`).
- Updated the `tests/property/combat-sequence.test.ts` header comment (the round-boundary-reset invariant note → per-turn). The property suite's `snapshotActive` helper is unused, so no assertion changed; the `fuzz-reactions-matrix` audit (the heavy reaction-driving suite) stays green.

## Counts

No count change — no new condition, effect kind, or wired spell. `doc-counts` surfaces untouched.

## Audit

- Struck `reaction-reset-timing` (Area 4 QUIRK), pointing at slice 879.
- Rollup: **Area 4** `2 → 1` open / `10 → 11` closed / `0/0/2 → 0/0/1`; **Total** `38 → 37` open / `79 → 80` closed / `0/13/25 → 0/13/24` (117 rows unchanged). Area 4 stays divergence-free, now a single open quirk: `no-hostility-model`. "Updated through slice 879."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (655 files, 4891 passed / 166 skipped) — including `fuzz-reactions-matrix` and the combat property/golden tiers. `doc-size` + `doc-links` + `doc-counts` audits green.
