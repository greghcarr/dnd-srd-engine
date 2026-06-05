# Slice 666 — engine + content: on-hit rider via castSpell (shining-smite, ray-of-enfeeblement)

**Type:** Engine schema + planner extension + content. **Sixth slice of the post-L3-RAW completeness push. Second spell-wiring primitive of the cycle.** Closes 2 deferred L2 spells with one schema change + composable use of existing primitives.

The gaps-spells.md "on-hit rider via castSpell" deferred bucket grouped two spells with structurally different shapes:
- **Ray of Enfeeblement** — ranged spell attack that, on hit, applies a condition (no direct damage).
- **Shining Smite** — bonus-action self-buff that primes the caster's NEXT melee weapon attack with extra Radiant damage + applies a target-side debuff.

Slice 666 closes both: Ray of Enfeeblement gets a new `conditionOnHit?: string` field on the `attack` mechanic (with `damageDice` now optional so attack-only spells work); Shining Smite is authored entirely with existing primitives (buff mechanic + OnEvent + AddDamage + ApplyCondition).

## What's wired

### Schema additions (attack mechanic)

- `damageDice` is now **optional** on the `attack` mechanic schema. When omitted, the planner skips the damage-roll/apply path entirely. Canonical user: Ray of Enfeeblement (no direct damage per SRD).
- `conditionOnHit?: string` added to the `attack` mechanic. When set, a successful hit emits a `ConditionApplied` event stamping the named condition on the attack's target. For concentration spells, the condition is bound to the EffectInstance via `sourceEffectInstanceId` so dropping concentration sweeps the condition off the target.

### Planner

- `planAttackMechanic` now takes a `concentrationEffectId: string | undefined` parameter (passed from `planCastSpell`) so it can stamp the right binding on the condition.
- `damageType` resolution is short-circuited when `damageDice` is undefined (no damage type to resolve).
- After a successful hit, the planner emits `ConditionApplied` with the configured `conditionOnHit` before checking whether to skip the damage path.

### Content

- **Ray of Enfeeblement** (L2 warlock/wizard): `mechanicalEffects: [{ kind: 'attack', attackKind: 'ranged', conditionOnHit: 'enfeebled' }]`. Concentration, up to 1 minute. On hit applies `enfeebled` to the target; concentration drop sweeps it.
- **Shining Smite** (L2 paladin): `mechanicalEffects: [{ kind: 'buff', conditionId: 'shining-smite-active' }]`. Self-applied bonus-action concentration buff.

### Conditions (3 new)

- `enfeebled` — marker for Ray of Enfeeblement's on-hit rider. RAW (SRD): target deals only half damage with STR weapon attacks. The half-damage enforcement stays consumer-managed (the engine ships the condition + the cleanup; the consumer reads the condition + applies the half-damage). Save-ends on the target's end-of-turn CON save (consumer-driven via `planSave`).
- `shining-smite-active` — applied to the paladin by the buff mechanic. Two OnEvent riders, each `consumeOnTrigger: true`:
  - First melee weapon hit → `AddDamage 2d6 radiant` (the +2d6 radiant arm).
  - First melee weapon hit → `ApplyCondition shining-smite-target-illuminated` (applies the target debuff).
- `shining-smite-target-illuminated` — applied to the struck target. Carries `GrantAdvantageToAttackers` (the "next attack against the target has Advantage" RAW arm). Lingering Dim Light 5-ft + end-of-turn CON save end the condition (consumer-managed).

## Scope decisions

- **Two different shapes, one slice**: ray-of-enfeeblement needs a new schema field (`conditionOnHit`); shining-smite needs zero engine changes (existing buff + OnEvent infrastructure). Both authored together because the gaps doc grouped them and they have the same RAW intent (the spell's outcome is keyed off the caster's attack hit).
- **`damageDice` made optional, not assertion-bypassed**: Ray of Enfeeblement deals no damage, so requiring a token "0d4" or similar would be a content lie. Making the field optional is the honest model; downstream paths short-circuit cleanly when it's absent.
- **Bind on-hit conditions to concentration EffectInstance**: when the spell is a concentration spell (ray-of-enfeeblement is), the condition carries `sourceEffectInstanceId`. The slice-110 `clearConcentrationEffect` sweep then removes the condition from the target when concentration drops. Non-concentration attack spells with `conditionOnHit` (if any future cohort ships them) get unbound conditions; the consumer manages duration manually.
- **Save-ends arms deferred**: both spells' end-of-turn CON save (Shining Smite's caster-DC save vs the target; Ray of Enfeeblement's spell-save-DC end-of-turn save on the enfeebled target) are consumer-driven via existing `planSave`. The consumer commits a `SaveRolled` and, on success, can manually remove the condition. Adding `recurring` save-end mechanic to these spells is a future slice (the `recurring` mechanic exists today for damage-tick aura spells, not condition-end saves).
- **Half-damage-with-STR enforcement deferred**: Ray of Enfeeblement RAW says the target deals only half damage with STR-based weapon attacks. The engine ships the `enfeebled` condition as a marker; the consumer reads it + applies the halving at the consumer's attack-resolution layer. A future engine slice could add a generic `HalvesDamageOfKind { kind: 'strength-weapon' }` Effect for the condition to project — out of scope here.

## Files

- **[../../src/schemas/content/spell.ts](../../src/schemas/content/spell.ts)**: `damageDice` made optional on attack mechanic; added `conditionOnHit?: string`.
- **[../../src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)**: `planAttackMechanic` signature gains `concentrationEffectId`; call site passes the parent's concentrationEffectId; damageType resolution short-circuits on undefined damageDice; on-hit `ConditionApplied` emission added after the hit branch (with `sourceEffectInstanceId` when concentration); damage path skipped when damageDice undefined.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: ray-of-enfeeblement gains `{ kind: 'attack', attackKind: 'ranged', conditionOnHit: 'enfeebled' }`; shining-smite gains `{ kind: 'buff', conditionId: 'shining-smite-active' }`; 3 new conditions (enfeebled, shining-smite-active, shining-smite-target-illuminated).
- **[../../tests/unit/engine/slice-666-on-hit-rider-castspell.test.ts](../../tests/unit/engine/slice-666-on-hit-rider-castspell.test.ts)** (new): 6 tests
  - Ray of Enfeeblement on hit: ConditionApplied for enfeebled, no DamageRolled/DamageApplied, sourceEffectInstanceId set.
  - Ray of Enfeeblement on miss: no condition applied.
  - Ray of Enfeeblement concentration drop: enfeebled sweeps off the target.
  - Shining Smite: applies `shining-smite-active` on the paladin via the buff mechanic.
  - Shining Smite condition: 2 OnEvent riders, both `consumeOnTrigger`.
  - shining-smite-target-illuminated: grants advantage to attackers.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L2 wired 37 → 39, deferred 5 → 3. ray-of-enfeeblement added to "Wired, cast-time"; shining-smite added to new "Wired, buff" group with the condition wiring documented.
- **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)** (3 places), **[../../docs/getting-started.md](../../docs/getting-started.md)**, **[../../docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: aggregate spell wiring 201 → 203, deferred 70 → 68, ~59% → ~60%; conditions 143 → 146, 128 rider → 131 rider. Doc-counts audit verifies.
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regen — two new entries (shining-smite-active, shining-smite-target-illuminated). Enfeebled has empty effects so doesn't appear in the wired-conditions snapshot.

## Tests

- `npx vitest run tests/unit/engine/slice-666-on-hit-rider-castspell.test.ts`: 6/6 pass.
- `npx vitest run tests/audit/gaps-spells-counts.test.ts tests/audit/doc-counts.test.ts`: 52/52 pass.
- `npx vitest run tests/coverage/features.test.ts` (regen): green; snapshot diff is the expected two-line addition.
- Full suite: 523 files / 3782 passing + 173 skipped (was 522 / 3777 post-665; +1 file / +6 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive schema fields**, **additive behavior**. The new `conditionOnHit` field defaults to undefined; all existing attack-spell content paths behave identically. The optional `damageDice` field is back-compat (all existing spells have it set).

**Behavior change for ray-of-enfeeblement + shining-smite cast paths**: pre-666 both spells cast with no mechanical effect (the consumer saw the `SpellCastDeclared` + slot consumption but no follow-on events). Post-666 they emit the correct RAW outcome. Any consumer that was manually applying enfeebled / shining-smite riders should now stop — the engine handles it.

## Audit (Uncle Bob)

- **Names**: `conditionOnHit` mirrors the existing `conditionOnFail` on the save mechanic — same shape, different trigger event. `shining-smite-active` / `shining-smite-target-illuminated` distinguish the caster-side priming buff from the target-side debuff.
- **DRY**: the on-hit condition emission uses the same `ConditionAppliedEvent` shape as every other ConditionApplied site; no helper extracted (each site adds 12 lines, mostly field setup). The `sourceEffectInstanceId` binding logic mirrors the slice-110 pattern already used elsewhere.
- **SRP**: schema declares the field; planner emits the event on hit; reducer (existing applyConditionApplied) stamps the condition; cleanup (existing clearConcentrationEffect's sweep) handles concentration drop. Each layer's job stays single-step.
- **Magic numbers / strings**: `'deflect-attacks'` source string from slice 664 reused inline; no new constants needed.
- **Pattern-check**: searched for other attack-spell mechanics that could lift the on-hit-condition pattern: ray-of-sickness (L1, currently just damage) per RAW also applies Poisoned on a failed CON save after the hit — but that's save-on-hit, not pure on-hit. Could be wired with a future "save after hit" composite arm. No other attack spell today has a no-damage condition-on-hit shape. The primitive is at the right level of generality for the existing user.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 666 of ~16):

- ~~660-665~~: L3 RAW behavior + first spell-wiring primitive. Landed.
- ~~666 (this slice)~~: on-hit rider via castSpell. Landed.
- **667**: Recurring-rider primitive (phantasmal-force).
- **668**: Flight/hover condition (levitate).
- **669**: On-action rider (dragons-breath).
- **670-672**: Composite-condition primitives.
- **673-676**: Audit + polish.

**Deferred (post-cycle)**:
- **Half-damage-with-STR-weapon enforcement for enfeebled**: a generic `HalvesDamageOfKind` Effect would auto-enforce; consumer-managed today.
- **Save-ends recurring mechanic for condition spells**: today `recurring` covers damage ticks; extending to "target rolls save at end of their turn; on success, condition ends" would close several save-ends RAW arms (Shining Smite's CON save, Ray of Enfeeblement's CON save, Hold Person's WIS save). Out of scope here.
