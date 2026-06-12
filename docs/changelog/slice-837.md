# Slice 837 — `weapon-material-qualifier` is NOT A BUG (stale 2014 finding)

**Type:** Audit reconciliation + a durable guard test. No engine, content, or schema change.

## The finding, and why it's wrong

The L7 audit row `weapon-material-qualifier` claimed: *"`GrantResistance.qualifier` is only nonmagical/magical — no silvered/adamantine; a party with silvered weapons still sees devil/lycanthrope resistance applied."* That premise is **2014-based**.

Canon-verifying against `references/srd-markdown/` (the only valid source):

- **SRD 5.2.1 removed the weapon-material resistance qualifier entirely.** Monster resistances are now **flat typed lists** with no source gate:
  - **Chain Devil** — *"Resistances Bludgeoning, Cold, Piercing, Slashing"* (flat; the pack matches exactly).
  - **Clay Golem** — *"Resistances Bludgeoning, Piercing, Slashing"* (flat; the pack matches).
  - **Werewolf** — has **no Resistances line at all**; **Stone Golem** — only *"Immunities Poison, Psychic"*. The 2014 "B/P/S from nonmagical attacks that aren't silvered/adamantine" is gone.
- **"Silvered" isn't a 2024 mechanic** — `silver` appears only as currency / flavor; there is no silvered-weapon rule.
- **"Adamantine"** appears only as an **object-AC value** (the breaking-objects table) and the **Adamantine Armor** crit-to-normal-hit rule — not a weapon qualifier.
- The pack already models every relevant creature with the flat 2024 resistance, and **zero** monsters use the `GrantResistance` `nonmagical`/`magical` qualifier (it remains a valid primitive for spells like Stoneskin, just unused by monster content).

**Implementing silvered/adamantine would be edition drift** — adding 2014 mechanics absent from the 2024 canon, the exact class of bug the SRD-canon discipline exists to prevent. So the row is resolved as NOT A BUG, struck through and moved to "Confirmed correct / by-design."

## The guard

`tests/audit/slice-837-weapon-material-qualifier.test.ts` (4) pins the conclusion so a future edit can't silently re-introduce the 2014 wording: the Chain Devil resists B/P/S + Cold as a flat list; the Clay Golem resists B/P/S flat; the Werewolf and Stone Golem have no B/P/S resistance/immunity; and **no monster** carries a `GrantResistance` qualifier (a nonmagical/magical qualifier on monster content would be 2014 drift).

## Verification

`npx tsc --noEmit` clean; the 4-test guard + doc-size/links green; no source change.
