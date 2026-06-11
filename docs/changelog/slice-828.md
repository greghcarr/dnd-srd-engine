# Slice 828 — monster save-action mechanism (Constrict)

**Type:** Engine primitive + canonical content users. Advances (and fully closes) the [L7 audit](../l7-completion-audit.md) `monster-onhit-rider-pass` quirk — its last open shape.

## The gap

The multiattack sweep (789–792) and the four on-hit-rider batches (822–826) closed every monster action that hangs a rider off a weapon *hit*. What remained was the genuinely different **save-action** shape: an action with **no attack roll**, resolved by a saving throw, where a *failed* save deals damage and applies condition(s). The canonical example is **Constrict** (SRD 5.2.1):

> **Constrict.** *Strength Saving Throw:* DC 18, one Large or smaller creature the behir can see within 5 feet. *Failure:* 28 (5d8 + 6) Bludgeoning damage. The target has the Grappled condition (escape DC 16), and it has the Restrained condition until the grapple ends.

The slice-321 weapon on-hit-rider machinery can't express this — there is no hit to hang the rider on. The breath weapon (slice 140) is the closest existing primitive (also auto-hit, save-resolved), but it's *area + recharge + damage-halved-on-success*; a save-action is *single-target, no recharge, condition-primary* (nothing happens on a success).

## What shipped

### The primitive

- **`SaveActionSpec`** (`src/schemas/content/monster.ts`) — a statblock `saveActions: []` array (defaulting to `[]`, so every existing statblock is byte-unchanged): `{ id, name, saveAbility, saveDC, reachFeet, maxTargetSize?, onFail: { damage[], applyConditionIds[] }, halfDamageOnSuccess }`. `onFail.damage` is an array of `{ dice, type }` so Salamander's bludgeoning + fire mitigate separately. `halfDamageOnSuccess` (default `false`) ships now so the shape generalizes to the half-on-success Whirlwind without a schema break.
- **`engine.plan.saveAction`** (`src/engine/plan/save-action.ts`) — resolves the save against the pre-baked DC (`sourceIsMagical: false` — Constrict is a natural attack, so Magic Resistance doesn't apply), and on a *failed* save runs the standard damage pipeline (mitigation → fatal-intercept → `DamageApplied` sourced to the monster → concentration-on-damage) and applies each condition with the monster stamped as `sourceCharacterId` (so a Grappled's grappler resolves) plus any `autoExpiry`. On a success it emits only the `SaveRolled` (unless `halfDamageOnSuccess`). A `maxTargetSize` gate throws on a too-large target (the single-target input-validation posture).
- **Wiring** — `plan/index.ts` export, `engine/index.ts` import + `Engine.plan.saveAction` interface/impl, and the planner-wiring allowlist (consumer-dispatched, like `breathWeapon`).

### Action economy is consumer-owned

The spec carries **no action cost**. Constrict bundles into the Multiattack action for the Behir / Salamander (whose Multiattack "uses Constrict") yet is a standalone action for the Constrictor Snake, and `MonsterMultiattack` can't express "uses Constrict" — so the consumer owns whether a Constrict costs part of a Multiattack or a full action, exactly as the runtime multiattack pattern is already consumer-sequenced. The planner only resolves the save + payload.

### Content — the in-scope Constrict family (each SRD-verified)

| Monster | CR | Save | Reach | Max size | On fail |
|---|---|---|---|---|---|
| Behir | 11 | STR DC 18 | 5 ft | Large | 5d8+6 bludgeoning, Grappled + Restrained |
| Couatl | 4 | STR DC 15 | 5 ft | Medium | 1d6+5 bludgeoning, Grappled + Restrained |
| Salamander | 5 | STR DC 15 | 10 ft | Large | 2d6+4 bludgeoning + 2d6 fire, Grappled + Restrained |
| Constrictor Snake | ¼ | STR DC 12 | 5 ft | Medium | 3d4 bludgeoning, Grappled only |

The audit row's "Marilith / Giant Constrictor" were off: **Marilith is CR 16** (out of scope) and there is no Giant Constrictor statblock in the pack — verified against `monsters-A-Z.md` / `animals.md` rather than assumed.

## Still open (split out)

The two whirlwind shapes are genuinely different and are now tracked as `monster-whirlwind-actions` in the audit: the **Air Elemental Whirlwind** (a save-action + recharge + forced push + half-on-success) and the **Djinni Create Whirlwind** (a Concentration-sustained conjured Cylinder that moves and saves creatures entering it — a persistent-hazard primitive, not a save-or-grapple).

## Guards & tests

- **Integrity** — a new pack-integrity check (sibling of the slice-788 weaponId guard): every `saveActions[].onFail.applyConditionIds[]` must name a real pack condition (typo guard).
- **`tests/unit/engine/slice-828-monster-save-actions.test.ts`** (6): the four constrictors carry the SRD spec; Behir Constrict on a failed save deals bludgeoning + Grappled + Restrained sourced to the behir; a successful save does nothing (only `SaveRolled`); Salamander deals both bludgeoning and fire; Constrictor Snake applies Grappled only (no Restrained); Behir Constrict refuses a Huge target (size gate).

## Verification

`npx tsc --noEmit` clean; planner-wiring + pack-integrity green; `npm run test:fast` green (609 files, 4640 passed). No new effect kind or condition (reuses `grappled`/`restrained`), so no doc-counts bump. No engine behavior change to existing content (additive `saveActions: []` default).
