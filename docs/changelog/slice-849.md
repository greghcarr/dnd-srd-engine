# Slice 849 — Enlarge/Reduce unwilling-target CON save (closes the "or-save" arm)

**Type:** Engine primitive + content. Closes the saving-throw half of the [L7 audit](../l7-completion-audit.md) Area-2 row `enlarge-reduce-no-damage-rider-or-save`; splits the ±1d4 weapon-damage rider into a tracked follow-up (`enlarge-reduce-no-damage-rider`).

## The divergence

RAW (SRD 5.2.1 Enlarge/Reduce):

> If the target is an unwilling creature, it can make a Constitution saving throw. On a successful save, the spell has no effect.

The engine modeled Enlarge/Reduce as a pure `buff` mechanic (`casterChoosesVariant` → `enlarged-active` / `reduced-active`, which carry only the STR advantage/disadvantage). `planBuffMechanic` applied the chosen condition to every `targetId` unconditionally — **no save**. So a caster could Reduce an enemy (Disadvantage on STR checks and saves) against its will with no roll at all, which an expert notices immediately.

## The primitive — save-gated buff

A generic addition to the `buff` SpellMechanic, reusable by any "buff an unwilling creature, save negates" spell:

- **Schema** (`SpellBuffMechanicSchema`): new optional `unwillingSave: { ability }`.
- **Intent** (`CastSpellIntent`): new optional `unwillingTargetIds: string[]`. The engine doesn't model willingness — creature-vs-creature relationships are consumer state — so which targets are unwilling is a consumer-supplied seam, exactly like `cover` / `lightLevel`.
- **Planner** (`planBuffMechanic`): now receives `rng` + the casting class/ability (already in scope at the dispatch site for the attack/save mechanics). When the mechanic carries `unwillingSave` **and** a target appears in `unwillingTargetIds`, it rolls that ability save vs the caster's spell save DC (`computeSpellSaveDC`, resolved once and reused) through the shared `rollSaveAgainstDC` primitive. The `SaveRolled` event is emitted either way (transcript visibility); on a **success** the condition is skipped for that target ("no effect"), on a **failure** it lands as before.

The set is empty unless both halves are present, so a willing target — and every other buff spell in the pack — takes neither branch and is **byte-identical** to the prior behavior.

## Content

Enlarge/Reduce's buff mechanic gained `unwillingSave: { ability: "CON" }`. Because the save sits on the single buff mechanic (above the variant fork), it gates **both** the enlarge and reduce variants.

## Scope split

The audit row bundled two arms; this slice closes the save arm and splits the other:

- **Closed:** the unwilling-target CON save (this slice).
- **Split off** as `enlarge-reduce-no-damage-rider`: RAW Enlarge adds +1d4 weapon/Unarmed damage on a hit; Reduce subtracts 1d4 (min 1). The +1d4 is the Divine-Strike `OnEvent` / `AddDamage`-on-`event.attackerIsSelf && event.hit` shape (mostly content), but Reduce's −1d4-with-min-1-floor needs a new damage-reduction rider primitive the damage pipeline doesn't have (`AddDamage` is additive-only and requires a concrete `damageType`). Tracked as a follow-up Area-2 row.

## What shipped

New 5-test `tests/unit/engine/slice-849-enlarge-reduce-unwilling-save.test.ts`: the spell carries the CON `unwillingSave`; a **willing** target is Enlarged with **no** save rolled; an **unwilling** target that **fails** the CON save is Enlarged (SaveRolled `ability: 'CON'`, `success: false`, condition applied); an unwilling target that **succeeds** resists entirely (no condition); and the **Reduce** variant is gated by the same save. Seed 1 yields a save d20 of 10 vs DC 15 (wizard L5, INT 18), so a CON-4 target (−3 → 7) fails and a CON-20 target (+5 → 15) succeeds — deterministic without probing.

## Verification

`npx tsc --noEmit` clean; new 5-test slice-849 green. No condition / effect-kind / weapon added (doc-counts unchanged); no coverage-snapshot change (`enlarged-active` / `reduced-active` were already wired). `npm run test:fast` + doc audits green.
