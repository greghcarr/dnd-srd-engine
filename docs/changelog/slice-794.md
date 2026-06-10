# Slice 794 — NPC spellcasting envelope (the primitive) + the Mage

**Type:** Engine primitive (effect + runtime counter + event) + canonical content user. **First half of** the [L7 audit](../l7-completion-audit.md) `spellcaster-npc-no-spells` blocker (Area 7); the content sweep (slice 795) closes it.

## The gap

Every SRD 5.2.1 NPC caster (Mage, Priest, Druid, Cultist Fanatic, and the dragons) uses one uniform statblock shape:

> *"The X casts one of the following spells, using \<ability\> (spell save DC \<N\>): **At Will:** … **N/Day Each:** …"*

There are **no spell slots** — the metering is per-spell casts-per-long-rest, and the **save DC / attack bonus are printed flat** on the statblock, not derived from a class level. A creature built as a runtime `Character` has no spellcasting class, so `computeSpellSaveDC` returned `0` — "a Mage is a stick-wielder." The "At Will" half already worked (slice 527 `GrantSpell{at-will}`), and AoE targeting already exists (slice 786/787); what was missing was the **fixed spellcasting profile** and the **N/Day-Each metering**.

## The primitive (two additive pieces)

- **`SetSpellcastingProfile`** effect — `{ ability, saveDC?, attackBonus? }`, authored in `MonsterStatblock.traits` alongside the spell grants. Folds through the existing trait → effect-stack path. `computeSpellSaveDC` / `computeSpellAttackBonus` short-circuit to the fixed value when a profile is present (else the unchanged `8 + prof + mod` derivation); the cast path uses the profile's `ability` when no per-spell `GrantSpell.spellcastingAbility` is set. **Bonus:** this also fixes the latent wrong save-DCs on *existing* at-will monster casters (a pattern-check sweep target for slice 795).
- **`GrantSpell { preparation: 'perLongRest', usesPerLongRest: N }`** — the "N/Day Each" bucket. Cast with `useFreeCast: true` (same signal as the `oncePerLongRest` free-cast path); the engine meters it against the new `Character.perDayCastsUsed` counter (a per-spell generalization of the boolean `usedFreeCastSpellIds`), emits `PerDayCastUsed` (no `SpellSlotConsumed`), and `applyLongRestEnded` clears the counter. `usesPerLongRest` defaults to 1.

Wiring: `effects.ts` (effect variant + the hand-written `Effect` union member), `builder.ts` (accumulator `setSpellcastingProfile`/`spellcastingProfile` + the grant carries `usesPerLongRest`), `spell-dc.ts` (both compute fns honor the profile), `cast-spell.ts` (`resolveCastingAbility` profile fallback + the per-day branch + `PerDayCastUsed` emit), the runtime field, the event (schema/barrel/reducer/`apply`/long-rest reset), and the two raw `Character` literals (summons, trigger dispatch).

## The canonical user: the Mage (CR 6)

`SetSpellcastingProfile{INT, saveDC:14}` + At Will (Detect Magic, Light, Mage Armor, Mage Hand, Prestidigitation) + 2/Day-Each (Fireball, Invisibility) + 1/Day-Each (Cone of Cold, Fly), all authored from existing pack spells.

## Deferred polish (tracked)

- The **`atSlotLevel` upcast pin** ("Fireball *level 4 version*") — the consumer passes `slotLevel` on the intent meanwhile.
- The **bonus-action / reaction spell groups** (Misty Step 3/Day, Protective Magic) — separate named actions needing action-economy placement.
- "One spell per Spellcasting action" grouping stays a consumer/AI concern (consistent with engine-scope on monster action economy).

## Tests

`tests/unit/engine/slice-794-npc-spellcasting.test.ts` (6): the statblock buckets; fixed DC 14 (breakdown `[{fixed:14}]`, not the class-derived value); an At Will leveled spell (Mage Armor) casts with no slot / no daily-use spend; Cone of Cold (1/Day) meters and blocks the second cast; Fireball (2/Day) allows exactly two; a long rest refreshes the budget. Two slice-486/566 tests updated for the broadened free-cast error message.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (577 files) — every existing character byte-unchanged (the field + counter are additive/opt-in).
