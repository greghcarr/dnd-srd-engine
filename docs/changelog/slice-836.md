# Slice 836 — ooze Split (Black Pudding / Ochre Jelly)

**Type:** Engine primitive (a statblock spec + a consumer-driven planner + a shared spawn-builder extraction) + content. Closes the [L7 audit](../l7-completion-audit.md) `ooze-split-on-damage` divergence.

## The gap

The Black Pudding and Ochre Jelly **Split** on the wrong kind of damage (SRD 5.2.1):

> **Split.** *Trigger:* While the pudding is Large or Medium and has 10+ Hit Points, it becomes Bloodied or is subjected to Lightning or Slashing damage. *Response:* The pudding splits into two new Black Puddings, each one size smaller, the original's Hit Points divided evenly (round down).

This was inert. The response needs *dynamic* HP (half the **current** HP), a **size-down**, and the original **replaced** — none of which the existing `SpawnCreature` trigger action (fixed statblock-average HP, same size) can express.

## What shipped

### The split, consumer-driven

- **`MonsterStatblock.split`** (`{ damageTypes, minHp }`, optional) — `damageTypes` is the trigger metadata the consumer reads (slashing/lightning); `minHp` (10) is the engine-validated floor.
- **`engine.plan.oozeSplit({ oozeId })`** — the consumer detects the trigger (it has the `DamageApplied` events + the HP, so it knows whether slashing/lightning landed or the ooze is Bloodied) and calls it; the engine resolves the *mechanical* split: validates RAW eligibility (size Large/Medium via `creatureSize`, `hp.current ≥ minHp`), then emits **two `CharacterCreated`** of the same statblock — **one size smaller** (a `sizeOverride`, Large→Medium / Medium→Small) at **`floor(currentHP / 2)`** each — and **`CreatureDestroyed`** on the original (it's replaced). Placement + the "acts on its Initiative" insertion stay consumer-managed (positions / encounter are out of engine scope, same as the Wraith Create Specter / Wight zombie spawns).

### Shared spawn-builder (rule-of-two)

The 35-required-field spawn snapshot was extracted from the Troll's inline `fireSpawnCreature` into a shared **`buildSpawnedCharacter(statblock, { hpCurrent?, hpMax?, sizeOverride? })`** (`src/engine/spawn.ts`) — the Troll passes no overrides (byte-compatible, the shape-based Troll test confirms), the ooze passes half-HP + a one-smaller `sizeOverride`. The full required-field list now lives in one place (it drifted before — `expendedSaveActionIds` in slice 829).

### Content

`split` on **Black Pudding** (CR 4, Large, 68 HP) + **Ochre Jelly** (CR 2, Large, 52 HP). Gray Ooze / Gelatinous Cube don't split in 2024 SRD (verified — only these two). The oozes' Pseudopod attacks remain unwired (a separate `actions`-population gap; the split-offs inherit the parent's empty `actions`).

## Tests

`tests/unit/engine/slice-836-ooze-split.test.ts` (5): both oozes carry the Split spec; a Large Black Pudding at 40 HP splits into two Medium copies at 20 HP each (same statblock, `sizeOverride` Medium), the original `CreatureDestroyed` (and the spawns seat into state on commit); odd HP rounds down (11 → two 5-HP); a Medium ooze splits into Small; and it refuses a Small ooze, an ooze below 10 HP, and a non-ooze (no Split trait).

## Verification

`npx tsc --noEmit` clean; planner-wiring (`oozeSplit` allowlisted) + pack-integrity + the Troll spawn test (refactor byte-compatible) green; `npm run test:fast` green (616 files, 4678 passed). No new condition / effect kind / event / weapon → no doc-counts bump.
