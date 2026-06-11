# Slice 814 — NPC-caster sweep remainder (fixed-DC profiles + the Archmage)

**Type:** Content (pure — zero engine change). **Closes** the [L7 audit](../l7-completion-audit.md) `npc-caster-sweep-remainder` quirk (Area 7), extending the slice 794-795 `SetSpellcastingProfile` primitive across the rest of the pack's NPC casters.

## The gap (and an audit correction)

Slices 794-795 closed the four named casters (Mage, Priest, Druid, Cultist Fanatic). The remainder row claimed three strands; auditing the actual pack content corrected one:

- **No dragon statblock in the pack grants spells.** The row's "the dragons … whose at-will `GrantSpell` casting derives the wrong DC (Fear, etc.)" was inaccurate — *Fear* is the dragons' **Frightful Presence** action (a separate printed-DC action), not a wired `GrantSpell`. There was no dragon DC bug to fix.
- The **real active bug** was the **Dryad**: its *Animal Friendship* and *Charm Monster* are WIS-save spells, but the Dryad carried no `SetSpellcastingProfile`, so a class-less runtime `Character` derived **spell save DC 0** — its charms auto-succeeded for the target.
- The other at-will casters (cloud/storm giant, couatl, unicorn, deva, planetar, solar) print a flat DC but currently cast only **no-save** spells (Detect Magic / Light / Detect Evil and Good), so their missing profile was **latent** — no active divergence, but a DC-0 hole the moment they cast anything with a save.

## What shipped

Pure content on the existing 794 primitive — no new engine code.

| Strand | Statblocks | Change |
|---|---|---|
| **Profile sweep** | dryad (CHA 14), cloud-giant (CHA 15), storm-giant (WIS 18), couatl (WIS 15), unicorn (CHA 14), deva (CHA 17), planetar (CHA 20), solar (CHA 25) | Add the printed `SetSpellcastingProfile{ability, saveDC}`. Fixes the Dryad's active DC-0 bug; records the canonical fixed DC on the other seven (latent). |
| **Dryad bucket** | dryad | Complete the RAW 1/Day Each: Entangle, Pass without Trace (both already in the pack). |
| **Archmage** | archmage | Its full *Spellcasting* action (INT, DC 17): At Will Detect Magic / Detect Thoughts / Disguise Self / Invisibility / Light / Mage Armor / Mage Hand / Prestidigitation; 2/Day Fly, Lightning Bolt; 1/Day Cone of Cold, Mind Blank, Scrying, Teleport. |

Every DC/ability/bucket transcribed directly from `references/srd-markdown/monsters-A-Z.md` (the canon clone). All referenced spells already exist in the pack.

## Still tracked (NOT this slice)

The **bonus-action / reaction spell groups** — Mage *Misty Step* 3/Day + *Protective Magic* (Counterspell/Shield reactions), Archmage *Misty Step* 3/Day, Priest *Divine Aid*, Cultist Fanatic *Spiritual Weapon* 2/Day, Dryad *Tree Stride* — are a second printed action needing action-economy placement, not the core Spellcasting action. Split out as the new audit row `npc-caster-bonus-action-groups`.

## Tests

`tests/unit/engine/slice-814-npc-caster-remainder.test.ts` (21): each of the nine statblocks carries the SRD `{ability, saveDC}` profile **and** the engine derives that flat DC end-to-end via `computeSpellSaveDC` (proving the 0 → DC fix, reusing the 795 monster→Character harness); the Dryad's 1/Day bucket and the Archmage's full bucket are pinned; and a **durable invariant** guards the whole bug class — *no monster grants a save-imposing spell (`mechanicalEffects[].kind === 'save'`) without a `SetSpellcastingProfile`*.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (596 files, 4575 passed) — no golden/fuzz transcript moved (the Dryad's DC 0 → 14 disturbs no pinned transcript) and the coverage/exports snapshots are unchanged.
