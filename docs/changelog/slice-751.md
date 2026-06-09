# Slice 751 — spell-cast reaction window (Counterspell)

**Type:** Driver/infra (combat-fuzz). Composes the existing `planCounterspell` planner; the only non-driver change is a build-gated prepared-spell addition. Third reaction-window slice after 749 (damage) and 750 (attack roll).

## Why

The reaction layer (749/750) covered the damage and attack-roll windows. This adds the **spell-cast window**: when a creature casts a leveled spell, an enemy can Counterspell it and the countered spell's effects are omitted. Same driver-side two-phase pattern (plan uncommitted → reaction window → commit full or sliced), gated behind `reactions: 'auto'`; `'none'` stays byte-identical.

## How

1. **RAW-faithful prepared (build-gated):** `buildL1` gains `includeCounterspell`; when true and the class is Wizard/Sorcerer it adds `counterspell` to `knownSpells` + `preparedSpells`. `runBattle` sets it to `reactions === 'auto' && level >= 5` (when 3rd-level slots exist), so `'none'` / sub-L5 builds — and their `CharacterCreated` snapshots — are unchanged. The reaction gates on `preparedSpells.includes('counterspell')`.
2. **Two-phase cast:** for an `'auto'` CastSpell intent the loop plans the spell uncommitted (`planIntent`) and routes it through the resolver.
3. **Resolver** ([scripts/reactions/pre-cast-policy.ts](../../scripts/reactions/pre-cast-policy.ts)): finds `SpellCastDeclared`; for a leveled spell, picks a counter-caster on the opposing team with Counterspell prepared (`shouldCounterspell`), a reaction, and a free 3rd-level slot (`computeAvailableSpellSlots`). Calls `engine.plan.counterspell` (rolls the original caster's CON save vs the counter-caster's DC). On `SpellCountered` (failed save) it commits the spell's declaration minus its effects; otherwise the spell resolves (the counter-caster still spent slot + reaction, RAW).

**Slice rule** (`keepDeclaration`): `planCastSpell` front-loads `[SpellCastDeclared, ActionEconomyConsumed, SpellSlotConsumed, …]` before any effect, so keep everything up to the first non-pre-effect event and drop the rest.

**Double-slot avoided:** the resolver passes `originalSpellLevel: 0` so Counterspell does NOT re-emit the original caster's slot loss — the planned spell already carries its own `SpellSlotConsumed`, which is kept. This also makes pact-slot casters work with no special-casing.

## Reactions / files

- **Counterspell** wired (Wizard/Sorcerer counter-caster).
- `scripts/reactions/pre-cast-policy.ts` — NEW. `resolveCastWithCounterspell` + `keepDeclaration` + the slot pre-check.
- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — `includeCounterspell` thread into `buildL1`; the `'auto'` CastSpell action-loop branch; `reactionContent` resolved once.
- [src/ai/reactions.ts](../../src/ai/reactions.ts) + [reaction-constants.ts](../../src/ai/reaction-constants.ts) + [src/ai/index.ts](../../src/ai/index.ts) — `shouldCounterspell` + `COUNTERSPELL_SPELL_ID` (barrel-exported). Reuses `computeAvailableSpellSlots` ([src/derive/spell-slots.ts](../../src/derive/spell-slots.ts)) and `reactionAvailable` (from reaction-policy.ts).

## Tests

- [tests/unit/ai/reactions.test.ts](../../tests/unit/ai/reactions.test.ts) — `shouldCounterspell`: prepared + leveled → true; cantrip → false; not prepared → false.
- [tests/integration/fuzz-reactions-default-guard.test.ts](../../tests/integration/fuzz-reactions-default-guard.test.ts) — default emits no `SpellCountered`, AND no character has `counterspell` prepared under the default (the build is `'auto'`-gated), AND explicit `'none'` normalized-equals the default.
- [tests/audit/fuzz-reactions-matrix.test.ts](../../tests/audit/fuzz-reactions-matrix.test.ts) — under `'auto'`, Counterspell fires, the countered spell leaks no damage (no `DamageRolled`/`DamageApplied` between the cast and the counter), and the sliced log replays equivalently.
- [tests/golden/s-reactions.test.ts](../../tests/golden/s-reactions.test.ts) — Counterspell fires + omits effects on a deterministic anchor (seed 16, L5, 2v2 PC).

No existing goldens/fuzz change (default path + builds untouched under `'none'`). No doc-counts impact.

## Open follow-ups

- Countercharm (save window), Protection (positions), and the clean engine two-phase API for RAW-perfect transcripts / interactive consumers.

## Verification

`npx tsc --noEmit` clean. New reaction tests green. Smoke over 180 `'auto'` L5-7 battles: 41 Counterspells, **0** leaked damage, **0** replay mismatches, 0 leveling failures, and **0** `counterspell`-in-prepared under `'none'`. Full `npx vitest run`: green, zero pre-existing tests changed.
