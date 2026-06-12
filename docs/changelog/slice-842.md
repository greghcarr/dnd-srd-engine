# Slice 842 — `variable-ac-by-posture` is NOT A BUG (stale 2014 finding)

**Type:** Audit reconciliation + a durable guard test. No engine, content, or schema change.

## The finding, and why it's wrong

The L7 audit row `variable-ac-by-posture` claimed: *"Statblock AC is a single number; prone/posture AC variants (Ankheg 14/11) are dropped."* The "14/11" is **2014-based**.

Canon-verifying against `references/srd-markdown/` (the only valid source):

- **The "11 while prone" is a 2014-PHB/MM artifact.** The 2014 Ankheg statblock read *"Armor Class 14 (natural armor), 11 while prone"*. The 2024 SRD 5.2.1 Ankheg is simply **"AC 14"** — a scalar (`monsters-A-Z.md`).
- **SRD 5.2.1 gives every monster a single AC number.** It folded natural armor into a flat value (no *"(natural armor)"* parenthetical) and **removed posture-based AC variants entirely**. A corpus-wide grep of the monster reference for *"while prone"*, *"(natural armor)"*, and any dual/parenthetical AC returns **zero matches** — every statblock's AC line is one number.
- The engine already models this correctly: `MonsterStatblock.ac` is `z.number().int().min(0)` — a scalar — and the Ankheg's pack `ac` is `14`, matching canon.

**Modeling a posture-variable AC would be edition drift** — reintroducing a 2014 mechanic absent from the 2024 canon. So the row is resolved as NOT A BUG, struck through and moved to "Confirmed correct / by-design." This closes the last open Area-7 (monster-runtime) row.

## The guard

`tests/audit/slice-842-variable-ac-by-posture.test.ts` (3) pins the conclusion so a future edit can't silently re-introduce the 2014 dual-AC mechanic:

- The Ankheg carries a **flat AC 14** (not a 14/11 dual).
- **Every** monster's `ac` is exactly one scalar non-negative integer (the 2024 single-number model).
- **No** monster object carries a posture/prone/dual-AC field (a list of plausible spellings — `acProne`, `acWhileProne`, `acVariants`, `naturalArmorAc`, … — is checked, so a re-introduction is caught however it's named).

## Verification

`npx tsc --noEmit` clean; the 3-test guard + doc-size/links green; no source change. No new condition/effect kind/weapon → no doc-counts bump.

## Side find (not in this slice)

While canon-checking the Ankheg's statblock, noticed its **Acid Spray** breath weapon has drifted: the pack carries `saveDC: 13, damageDice: "3d6"`, but SRD 5.2.1 reads **DC 12, 14 (4d6) Acid damage**. That's a separate content-drift bug orthogonal to the AC row — flagged for a follow-up content slice rather than folded in here (slice cadence: one coherent change per commit).
