# Slice 795 — NPC-caster content sweep (Priest, Druid, Cultist Fanatic)

**Type:** Content (pure — zero engine change). **Closes** the [L7 audit](../l7-completion-audit.md) `spellcaster-npc-no-spells` blocker (Area 7), the second half of the slice-794 primitive.

## What shipped

The three remaining named SRD 5.2.1 NPC casters now carry their RAW *Spellcasting* action, authored on the slice-794 primitive (`SetSpellcastingProfile` trait + `GrantSpell` At Will / `perLongRest` buckets). The Mage shipped as 794's canonical user.

| Statblock | CR | Ability | DC | Atk | At Will | N/Day Each |
|---|---|---|---|---|---|---|
| **Priest** | 2 | WIS | 13 | — | Light, Thaumaturgy | 1/Day: Spirit Guardians |
| **Druid** | 2 | WIS | 13 | — | Druidcraft, Speak with Animals | 2/Day: Entangle, Thunderwave · 1/Day: Animal Messenger, Longstrider, Moonbeam |
| **Cultist Fanatic** | 2 | WIS | 12 | +4 | Light, Thaumaturgy | 2/Day: Command · 1/Day: Hold Person |

Every referenced spell already exists in the pack; the Cultist Fanatic exercises the profile's `attackBonus` (+4) too. All transcribed directly from `references/srd-markdown/monsters-A-Z.md` (the canon clone), not a web source.

## Why these three (and not every caster)

The blocker names exactly these four. The same shape recurs on more statblocks — tracked as the new `npc-caster-sweep-remainder` quirk row in the audit:

- The **Archmage** (a full Spellcasting list).
- Each caster's **bonus-action / reaction spell group** (Priest *Divine Aid* 3/Day, Cultist *Spiritual Weapon* 2/Day, Mage *Misty Step* 3/Day + *Protective Magic*) — these are separate named actions needing action-economy placement, not the core Spellcasting action.
- The **dragons / giants** whose at-will `GrantSpell` casting (slices 527/529) predates `SetSpellcastingProfile`, so their save spells (Fear, etc.) still derive the wrong DC — the latent-DC pattern-check 794 flagged. Pure content to fix (add the profile).

## Tests

`tests/unit/engine/slice-795-npc-caster-sweep.test.ts` (7): each statblock ships the profile + the correct At Will / N/Day buckets; each derives its flat statblock spell save DC (13/13/12) — and the Cultist Fanatic its +4 attack — through the engine's `computeSpellSaveDC`/`computeSpellAttackBonus` rather than a class-derived value; and a non-Mage caster (the Druid) meters Thunderwave end-to-end (2/Day → blocked on the third, no slot consumed).

## Milestone

With this, **zero confirmed blockers remain in the L7 audit** — the only `BLOCKER`-tagged entry left is Area 6's single `1*` row, itself tagged pending an ownership/canon confirm (not firmly a blocker).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green.
