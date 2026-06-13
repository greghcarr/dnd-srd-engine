# Slice 847 — Hideous Laughter projects Prone + Incapacitated (closes `hideous-laughter-no-conditions`)

**Type:** Engine primitive (a force-advantage flag on the recurring save) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 `hideous-laughter-no-conditions` row.

## The gap

RAW 2024 Hideous Laughter (`spells.md`):

> On a failed save, it has the **Prone and Incapacitated** conditions for the duration. … At the end of each of its turns **and each time it takes damage**, it makes another Wisdom saving throw. The target has **Advantage on the save if the save is triggered by damage**. On a successful save, the spell ends.

`hideous-laughter-active` shipped `effects: []`. The Incapacitated half was wired (the variant id is in `ACTION_BLOCKING_CONDITIONS`, slice 366) and the end-of-turn recurring WIS save was wired — but the **Prone half projected nothing**, so a creature laughing helplessly on the ground was not easier to hit in melee, and the **damage-triggered repeat save's Advantage** was unmodeled. Two residual deviations the slice-366 closure had explicitly left open.

## What shipped — the content arm

`hideous-laughter-active` now carries Prone's three effect-stack arms:

- `SetAdvantage { on: 'attack', mode: 'disadvantage' }` — the bearer's own attacks (moot while Incapacitated, but RAW-correct and harmless),
- `GrantAdvantageToAttackers` when `event.attackKind === 'melee'`,
- `ImposeDisadvantageOnAttackers` when `event.attackKind === 'ranged'`.

These are **generic effect primitives keyed on `event.attackKind`**, so they reproduce Prone's combat math without relying on the literal `prone` condition id (the same way the base `prone` condition is implemented). The Incapacitated half stays engine-coded via `ACTION_BLOCKING_CONDITIONS` (2024 Incapacitated has no Speed-0 or attacker-advantage of its own). RAW "it can't end the Prone condition on itself" is satisfied: the held creature is Incapacitated, and the Prone arm only lifts when the whole condition does (the recurring save / concentration drop).

Because the variant now carries effects, it was removed from the `EFFECT_LESS_OK` allowlist in `tests/audit/pack-integrity.test.ts` (the allowlist audit asserts its entries stay empty-effect).

## What shipped — the engine arm (the flag)

The damage-triggered repeat save RAW-grants Advantage; the end-of-turn save does not. A single `recurringSave` config can't express "flat at turn-end, Advantage on damage," and the engine deliberately leaves tick-*timing* to the consumer — so the missing piece was a way to roll one tick with Advantage. A new opt-in flag threads through three layers:

- **`TickRecurringSaveIntent.advantage`** (`recurring-save.ts`) — when set, the tick rolls with an extra advantage source. The consumer sets it when it fires the tick in response to the bearer taking damage; the end-of-turn tick leaves it unset.
- **`RollSaveInput.advantage`** (`_save-roll.ts`) — threaded into `computeSavingThrow` as `extraAdvantage`.
- **`ComputeSaveInput.extraAdvantage`** (`derive/save.ts`) — folded into `effectiveAdvantage` **before** the RAW advantage/disadvantage netting (`hasAdvantage = effectiveAdvantage && !effectiveDisadvantage`), so a caller-supplied advantage nets against any disadvantage source exactly like condition- or Magic-Resistance-derived advantage.

The flag is opt-in (default undefined / false), so **every other save in the engine is byte-identical** — no existing content sets it.

## Tests

`tests/unit/engine/slice-847-hideous-laughter-conditions.test.ts` (6): the variant carries Prone's three effects; it is still action-blocking (Prone + Incapacitated compose); a **melee attack** against the laughing target rolls `used: 'advantage'` and a **ranged attack** rolls `used: 'disadvantage'`; the **end-of-turn tick** rolls a flat WIS save (`used: 'none'`, one d20) while the **damage-triggered tick** (`advantage: true`) rolls `used: 'advantage'`, two d20s.

## Verification

`npx tsc --noEmit` clean. New 6-test slice-847 green; pack-integrity (EFFECT_LESS_OK now accurate), slice-366 (still action-blocking), slice-568 (Prone attacker arms), slice-567 / incapacitated-parity all green. The wired-conditions coverage snapshot gains `hideous-laughter-active` (now wired) — updated via `-u`. No condition added (count stays 169 / 154 rider); the "carry effects" prose bumps 129 → 130. The flag is opt-in, so the full save-spell golden + fuzz tiers are unaffected. `npm run test:fast` green.
