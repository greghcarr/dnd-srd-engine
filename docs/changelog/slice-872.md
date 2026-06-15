# Slice 872 — Faithful Hound + the non-concentration aura tick

**Type:** Engine (generalize `planTickAura` to non-concentration auras) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-faithful-hound` ("invisible watchdog + 4d8 bite vs adjacent hostiles; nothing").

## The gap

RAW (SRD 5.2.1 Faithful Hound, Wizard): "At the start of each of your turns, the hound attempts to bite one enemy within 5 feet of it. That enemy must succeed on a Dexterity saving throw or take 4d8 Force damage." (Duration **8 hours — not Concentration**.) The spell shipped `mechanicalEffects: []`.

The bite is structurally an `aura-damage` tick (5-ft range, DEX save, 4d8 Force, no half) — the same machinery Spirit Guardians / Wall of Fire use. But `planTickAura` resolved the aura's spell from `caster.concentrationEffectId`, so it only worked for **concentration** auras. Faithful Hound is non-concentration, so the bite couldn't be ticked at all.

## The fix

`planTickAura` now ticks a **non-concentration aura by `spellId`**: `TickAuraIntent` gains optional `spellId` (+ `slotLevel`, default the spell's level). When `spellId` is set, the planner resolves the spell + slot directly from content — no effect instance needed (the aura's position / existence is consumer-managed, exactly as for every aura). The concentration path (no `spellId`) is unchanged. A non-concentration aura with no save leaves `DamageApplied.causedByEventId` unlinked (it's optional); Faithful Hound always rolls a save, so its damage links to the `SaveRolled`.

Content: `faithful-hound` wired `{ aura-damage, rangeFeet: 5, saveAbility: DEX, damageDice: '4d8', damageType: force, halfOnSuccess: false }`. The consumer ticks it at the caster's turn-start against the one adjacent enemy.

**Pattern-check.** **Grease** (L1) was the other non-concentration `aura-damage` spell — its DEX-save-or-Prone tick was unusable for the identical reason (it was even marked `skip` in the coverage map citing this exact gap). It now ticks via the same `spellId` path, with no content change.

### Deferred

The hound's invisible-watchdog / Truesight / bark-on-intruder alarm, its placement (an unoccupied space within range), the password, and the "move the hound 30 ft" action are all positional / narrative — consumer-owned, like every aura's membership.

## What shipped

- `TickAuraIntent.spellId` / `.slotLevel` (`concentration.ts`); `planTickAura` resolves the spell from `spellId` (non-conc) or the concentration effect (conc); the `causedByEventId` fallback tolerates the effect-less path.
- Content: `faithful-hound` wired (aura-damage).
- New 4-test `tests/unit/engine/slice-872-faithful-hound.test.ts`: the wire; casting claims no Concentration + the bite ticks by `spellId` (DEX DC 15 → 4d8 Force on a fail); ticking without `spellId` still requires concentration (rejects a non-concentration caster); the Grease pattern-check (DEX save → Prone via the same path).
- `spell-coverage`: a `nonConcentration?` flag on the aura-damage expectation (skip the `ConcentrationStarted` assertion + tick by `spellId`); `faithful-hound` → wired aura-damage, `grease` flipped from `skip` → wired aura-damage.
- Counts: spell-wired `214 → 215` / schema-only `57 → 56` / L4 `23 → 24 wired`, `5 → 4 deferred` (Grease was already counted wired). `api-overview` `tickAura` note updated.

## Verification

`npx tsc --noEmit` clean; new 4-test slice-872 green; spell-coverage green (faithful-hound + grease now exercised). `npm run test:fast` (649 files, 4865 passed — +1 file / +6 tests over slice 871). doc-counts + doc-size + doc-links + `release:doc-review` ("wired count 215 MATCHES") green. The concentration aura path is byte-unchanged (every existing aura-damage test stays green). No new condition / effect / snapshot.
