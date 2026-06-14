# Slice 869 — Dominate Beast: WIS save → Charmed (Concentration) + damage re-save

**Type:** Engine (one additive save-mechanic field) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-dominate-beast` ("WIS save → control; no save/condition emitted").

## The gap

RAW (SRD 5.2.1 Dominate Beast): "One Beast you can see within range must succeed on a Wisdom saving throw or have the Charmed condition for the duration. ... Whenever the target takes damage, it repeats the save, ending the spell on itself on a success." (Concentration, up to 1 minute.) The spell shipped `mechanicalEffects: []` — a cast did nothing.

## The fix

Content-only wire **reusing the shared `charmed` condition** so no new condition is needed and the slice-807 Charmed arms apply for free:

```json
{ "kind": "save", "ability": "WIS", "targetCreatureType": "Beast",
  "conditionOnFail": "charmed", "conditionRepeatsSaveOnDamage": true }
```

- **Beast-gated** via `targetCreatureType` (slice 500): non-Beast targets are skipped entirely (no save, no condition).
- **Shared `charmed`** (not a variant): the dominated Beast can't attack the charmer, the charmer gets social-check Advantage, and Countercharm sees it — all the slice-807 / Countercharm machinery that keys on `conditionId === 'charmed'` works with zero new wiring.
- **Concentration-bound**: `planSaveMechanic` stamps `sourceEffectInstanceId`, so the charm lifts when the caster's Concentration drops.
- **Damage re-save**: one new opt-in save-mechanic field, **`conditionRepeatsSaveOnDamage`**, stamps the slice-388 per-instance recurring save (`recurringSaveAbility` = the mechanic's ability, `recurringSaveDC` = the caster's spell save DC, resolved at cast time) onto the applied `charmed`. The consumer ticks `tickRecurringSave` when the bearer takes damage; the per-instance path rolls WIS vs the baked DC and removes the charm on a success. Distinct from `conditionEndsOnDamage` (which auto-ends on any damage with no save).

`tickRecurringSave` is already trigger-agnostic (the consumer decides when to fire it — the same path Hideous Laughter uses for its damage re-save), so the only engine change is the one stamping field; no planner-tick change.

**Pattern-check.** Dominate Person (L5) and Dominate Monster (L8) — already wired as `{ save WIS, conditionOnFail: charmed }` — carry the identical RAW "repeats the save on damage" clause and were missing it. The flag is applied to all three.

Deferred (DM/consumer): the telepathic control link (issuing commands), the "Advantage on the save if you or your allies are fighting it" arm, and the upcast longer Concentration durations.

## What shipped

- `conditionRepeatsSaveOnDamage` on `SpellSaveMechanicSchema`; the stamp in `planSaveMechanic` (`cast-spell.ts`) on the `ConditionApplied` event.
- Content: `dominate-beast` wired; `dominate-person` / `dominate-monster` gain the flag (pattern-check).
- New 4-test `tests/unit/engine/slice-869-dominate-beast.test.ts`: all three Dominate spells carry the flag + `conditionOnFail: charmed`; a Beast failing the WIS save is Charmed (DC 15) with the concentration link + `recurringSaveDC: 15` / `recurringSaveAbility: WIS` stamped; a Humanoid is skipped; the ticked damage re-save (WIS vs 15) ends the charm on a success.
- `spell-coverage` flips `dominate-beast` to a documented "wired, Beast-gated, exercised by the dedicated slice test" entry (the generic harness targets Humanoids).
- Spell-wired counts bumped across `gaps-spells.md` (L4 `20 → 21 wired` / `8 → 7 deferred`) + the cross-doc citations (README / status ×3 / getting-started / starter-pack-gaps: `211 → 212 wired`, `60 → 59 schema-only`, `~62% → ~63%`). `release:doc-review` reports "wired count 212 MATCHES"; `doc-counts` green.

## Verification

`npx tsc --noEmit` clean; new 4-test slice-869 green; spell-coverage green. `npm run test:fast` (646 files, 4850 passed — +1 file / +4 tests over slice 868). doc-counts + doc-size + doc-links + `release:doc-review` green. No new condition/effect/primitive (the field is a mechanic option, not an `EFFECT_KIND`); exports/types snapshots unchanged.
