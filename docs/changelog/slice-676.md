# Slice 676 — tests: multiclass fuzz audit + pack-integrity allowlist sync

**Type:** Audit-only. **Sixteenth and final slice of the post-L3-RAW completeness push.** Closes the slice-644 deferred follow-up: "Multiclass fuzz support in combat-fuzz-core.ts."

Two pieces:
1. **Multiclass build-fuzz audit**: a new `tests/audit/multiclass-fuzz.test.ts` runs 50 seeds of random L1+L1 distinct-class characters through the build + derive path. Confirms the engine handles arbitrary multiclass combinations cleanly under random seeds.
2. **Pack-integrity allowlist sync**: the slice-666 (`enfeebled` / shining-smite), slice-667 (`phantasmal-force-active`), slice-669 (5 `dragons-breath-<type>-active` variants), and slice-672 (`blink-active` / `blink-ethereal-active`) marker conditions are intentionally effect-less (the mechanic lives in dedicated planners or is consumer-managed); allowlisted in `EFFECT_LESS_OK` with documented rationale.

## What's wired

### Multiclass fuzz audit

- New `tests/audit/multiclass-fuzz.test.ts`: 50 seeds. Each seed picks 2 distinct classes via a tiny seededRNG-wrapped `rngFloat()`, builds via `CharacterSchema.parse` with all-14 ability scores (clears every multiclass prerequisite), commits `CharacterCreated`, derives the character sheet via `engine.derive.character`, asserts derive returned a sheet with `ac.total > 0`.
- Scope: build + derive only. Combat-mode multiclass support (with multiclass-aware loadout selection in `pickIntent`) is deferred — the existing fuzz harness's `pickIntent` knows per-single-class loadouts only, and adapting it to multiclass would require non-trivial design (which class's loadout / spell list to draw from).

### Pack-integrity allowlist additions

8 marker conditions added to `EFFECT_LESS_OK` with one-line rationales:

| Condition | Slice | Why effect-less |
|---|---|---|
| `phantasmal-force-active` | 667 | marker for `planTickRecurring`; disbelieve consumer-driven |
| `dragons-breath-acid-active` ... `-poison-active` (5) | 669 | markers for `planExhaleDragonsBreath`; caster-choice variants |
| `blink-active` | 672 | marker; `planBlinkTurnEnd` reads it |
| `blink-ethereal-active` | 672 | plane semantics consumer-managed (engine has no plane model) |

## Scope decisions

- **Build + derive audit, not combat-mode integration**: extending `combat-fuzz-core.ts`'s `pickIntent` to multiclass would require either picking the loadout from ONE of the multiclassed classes or merging the two. Both are scope-substantial design decisions that deserve their own slice. The build + derive surface covers most regressions.
- **50 seeds, not 100+**: ~140ms wall-clock for 50 seeds. Build + derive is fast; seed count chosen to catch most surface variety without inflating CI.

## Files

- **[../../tests/audit/multiclass-fuzz.test.ts](../../tests/audit/multiclass-fuzz.test.ts)** (new): 50 tests.
- **[../../tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts)**: `EFFECT_LESS_OK` allowlist extended with 8 entries (slices 667 + 669 + 672) + documented rationales.

## Tests

- `npx vitest run tests/audit/multiclass-fuzz.test.ts`: 50/50 pass in ~140ms.
- `npx vitest run tests/audit/pack-integrity.test.ts`: 24/24 pass.
- Full suite: 532 files / 4080 passing + 173 skipped.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Audit-only addition + content allowlist sync**. No engine code, no schema change.

## Audit (Uncle Bob)

- **Names**: `multiclass-fuzz.test.ts` mirrors the existing fuzz audit naming pattern.
- **DRY**: reuses `CharacterSchema.parse` + `seededRNG` + `engine.derive.character` — no new build helpers.
- **SRP**: pure audit; no production-code changes.
- **Magic numbers**: `SEEDS = 50` named constant.
- **Pattern-check**: pack-integrity's effect-less allowlist is the single source of truth for "this condition is intentionally effect-less"; every new marker condition added in the cycle is documented there.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 676 of ~16): **all sixteen slices landed.**

- ~~661~~: Land-swap supersession.
- ~~662~~: Generic GrantAbilitySubstitution primitive.
- ~~663~~: Always-enforce ability substitutions.
- ~~664~~: Deflect Attacks damage-pipeline auto-integration.
- ~~665-672~~: 8 spell-wiring primitives (zone-of-truth/tiny-hut/wind-wall, ray-of-enfeeblement/shining-smite, phantasmal-force, levitate, dragons-breath, slow, beacon-of-hope, blink).
- ~~673~~: L3 triple-class multiclass audit.
- ~~674~~: L3 fuzz floor widening.
- ~~675~~: `seedResourcesFromContent` helper.
- ~~676 (this slice)~~: Multiclass fuzz audit + allowlist sync.

**The 16-slice cycle is closed. L1 + L2 + L3 SRD completeness is achieved.**

**Final state**:
- **L1, L2, L3 spell wiring: 100% wired-or-narrative** (0 deferred across all three levels).
- **L1 + L2 + L3 floors green**: srd-l1-complete (38 checks), srd-l2-complete (32 checks), srd-l3-complete (40 checks) all pass.
- **L3 RAW behavior**: all three slice-660 documented gaps closed (land-swap supersession, always-enforce ability substitution, Deflect Attacks pipeline auto-integration).
- **Audit coverage**: L1+L1 + L1+L2 + L1+L1+L1 multiclass (all 418 pairs/triples covered); fuzz matrix L1+L2+L3 (1,080 battles per CI run); multiclass build-fuzz (50 random seeds).
- **Engine ergonomics**: `seedResourcesFromContent` helper closes the "consumer hand-authors resources" drift trap.

**Ready to tag** `v0.3.0-alpha.0` (L2 SRD complete) and `v0.4.0-alpha.0` (L3 SRD complete). Per [CLAUDE.md](../../CLAUDE.md), tags ship only on explicit user instruction.

**Post-cycle deferred (explicit non-blockers)**:
- Auto-call `seedResourcesFromContent` in `createPC` (would need to thread `content` parameter through createPC — API-evolution slice).
- Combat-mode multiclass fuzz (would need `pickIntent` to know multiclass loadouts).
- Save-ends recurring mechanic for condition spells (Shining Smite / Ray of Enfeeblement / Hold Person etc.).
- Half-damage-with-STR-weapon auto-enforcement for `enfeebled` (consumer-managed today).
- Death-save advantage threading through `planDeathSaveAtTurnStart` (Beacon of Hope arm).
- Position / plane / scene-geometry models (consumer-managed; engine intentionally has no positions).
