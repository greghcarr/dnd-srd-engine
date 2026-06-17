# Slice 894 — Giant Insect (the 2024 summon) — closes `l4-giant-insect`

**Type:** Content (one `summon` mechanic reusing the shipped primitive). Closes the L7 audit Area-2 DIVERGENCE `l4-giant-insect`.

## Edition note

The audit row's *"transforms vermin into controlled giant versions"* is the **2014** spell. The SRD 5.2.1 Giant Insect is a **Conjuration summon**: *"You summon a giant centipede, spider, or wasp (chosen when you cast) ... It manifests in an unoccupied space ... and uses the Giant Insect stat block. ... The creature disappears when it drops to 0 Hit Points or when the spell ends."* (Concentration, 10 min.) So there's no "transform a target creature" mechanic to build — it's a summon, like Conjure Animals.

## The fix

`giant-insect`'s `mechanicalEffects: []` → a `summon` mechanic, matching the SRD Giant Insect stat block and the shipped summon shape (Conjure Animals / Summon Beast / Find Steed):

```json
{ "kind": "summon", "name": "Giant Insect", "ac": 15, "hpBase": 30, "hpPerSlotAbove": 10, "baseSlotLevel": 4, "speedFeet": 40 }
```

AC 11 + spell level = 15 at L4; HP 30 (+10 per slot above 4); Speed 40. The cast emits a `CompanionSummoned` controlled by the caster, concentration-bound (so it's auto-dismissed when Concentration ends, per "disappears when the spell ends"). Content only — no engine/schema change; reuses the slice-summon primitive.

Consumer/narrative (as for every summon): the form choice (centipede/spider/wasp) and its form-specific stat-block details — Fly 40 for Wasp, Multiattack, Poison Jab / Web Bolt (Spider) / Venomous Spew (Centipede) — plus the initiative-sharing ("shares your Initiative, takes its turn after yours") and command-obeying. The summon mechanic models one Giant Insect creature with the shared AC/HP/Speed; the consumer drives its actions, exactly as it does Conjure Animals.

## Tests

New `tests/unit/engine/slice-894-giant-insect.test.ts` (3 tests): a L4 cast summons the Giant Insect (HP 30, AC 15, controlled by the caster, `spellId: giant-insect`); HP scales +10 per slot above 4 (slot 6 → 50); the summon is concentration-bound (shares the `ConcentrationStarted` effect id). The `spell-coverage` entry flipped `skip` → `summon`.

## Counts

`giant-insect` flips schema-only → wired (summon): L4 `25 → 26` wired / `3 → 2` deferred; cross-doc spell totals `216 → 217` wired / `55 → 54` schema-only (pct stays ~64%). Reconciled in `gaps-spells.md` (+ the deferred-list trim, which also annotated the now-out-of-scope `locate-creature` / `hallucinatory-terrain` from slice 892), README, status, getting-started.

## Audit

- Struck `l4-giant-insect`; Rollup: **Area 2** `2 → 1` open / `22 → 23` closed / `0/1/1 → 0/0/1`; **Total** `24 → 23` open / `93 → 94` closed / `0/8/16 → 0/7/16`. The Area-2 frontier is now a single quirk, `chromatic-orb-no-leap`.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (666 files, 4941 passed / 165 skipped). `doc-counts` (incl. `gaps-spells-counts`) + `doc-size` + `doc-links` audits green.
