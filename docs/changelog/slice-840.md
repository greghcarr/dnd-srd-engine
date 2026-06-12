# Slice 840 — Legendary Actions (Aboleth)

**Type:** Engine primitive (statblock spec + state field + event + turn-start refresh + consumer-driven planner) + content. Closes the [L7 audit](../l7-completion-audit.md) `legendary-actions-pool` row — and, with slice 839, the whole `legendary-lair-actions` lineage.

## The gap

The Aboleth's Legendary Actions (SRD 5.2.1):

> **Legendary Action Uses: 3 (4 in Lair).** Immediately after another creature's turn, the aboleth can expend a use to take one of the following actions [**Lash** — one Tentacle attack; **Psychic Drain** — Consume Memories + regain 5 HP]. The aboleth regains all expended uses at the start of each of its turns.

## What shipped — the budget

The engine owns the **budget**; the timing and the underlying action are consumer-orchestrated.

- **`MonsterStatblock.legendaryActions`** (`{ uses, usesInLair?, actions: [{ name, cost }] }`, optional) — the pool + the menu (each action's name + a cost in uses, default 1).
- **`Character.legendaryActionsUsed`** — a per-round counter (counts up). **Refreshed at the creature's turn-start**: a no-op reset in `applyTurnStarted` ("regains all expended uses at the start of each of its turns") — deterministic, so no event, and a no-op for non-legendary combatants (always 0), keeping existing battles byte-unchanged.
- **`engine.plan.legendaryAction({ creatureId, actionName, inLair? })`** — the consumer (after another creature's turn — a reaction-like timing) picks a legendary action and calls this; the engine validates the menu + that the pool can afford the cost (throwing otherwise), then emits **`LegendaryActionUsed`** (+ the reducer spends the cost). `inLair` raises the pool to `usesInLair`.

The "after another creature's turn" timing is consumer-orchestrated (like a reaction), and the underlying game action — **Lash** = a Tentacle attack, **Psychic Drain** = Consume Memories + a heal — is dispatched **separately** by the consumer. (Those Aboleth actions themselves aren't wired — that's the broader `multiattack`/actions-population gap; this slice ships the legendary-action *budget* + the Aboleth's menu.)

## Content

The Aboleth's `legendaryActions` (uses 3, In Lair 4; actions Lash + Psychic Drain). Verified the only in-scope creature with Legendary Actions (vs Legendary Resistance, which slice 839 wired on Aboleth + Sphinx of Lore + Unicorn).

## Tests

`tests/unit/engine/slice-840-legendary-actions.test.ts` (5): the Aboleth carries the SRD pool + menu; spending Lash emits `LegendaryActionUsed` + increments the counter; the pool of 3 throws on a 4th spend and In Lair raises it to 4; the pool refreshes at the creature's turn-start (end-to-end through `advanceTurn`); and it throws for an unknown action / a non-legendary creature.

## Verification

`npx tsc --noEmit` clean; planner-wiring (`legendaryAction` allowlisted) + pack-integrity + migrations (optional-default field) green; `npm run test:fast` green (620 files, 4697 passed) — the `applyTurnStarted` refresh is a no-op for existing combatants, so the fuzz goldens are byte-unchanged. No new condition / effect kind / weapon → no doc-counts bump.
