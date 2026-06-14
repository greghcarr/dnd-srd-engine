# Slice 860 — off-hand attack must use a different weapon than the main hand

**Type:** Engine fix + a corrected affordance test (no content). Closes the [L7 audit](../l7-completion-audit.md) Area-6 quirk `offhand-not-different-weapon`.

## The divergence

RAW (SRD 5.2.1, the **Light** weapon property):

> When you take the Attack action on your turn and attack with a Light weapon, you can make one extra attack as a Bonus Action ... **That extra attack must be made with a different Light weapon** ... (for example, you can attack with a Shortsword in one hand and a Dagger in the other).

`planOffHandAttack` checked that the off-hand weapon had the `light` property but never that it **differed from the main hand** — so a creature could make its off-hand (extra) attack with the very weapon it had just struck with.

## The fix

After the `light` gate, the planner now rejects an off-hand weapon whose **instance** equals `equipped.mainHand`:

```ts
if (attacker.equipped.mainHand !== undefined &&
    intent.weaponInstanceId === attacker.equipped.mainHand) {
  throw new Error('Off-hand attack must use a different Light weapon than the main hand ...');
}
```

The check is deliberately **instance-level**, not definition-level: dual-wielding two of the *same weapon type* (two Shortswords) is RAW-legal — they are two distinct weapons — so only reusing the **same** weapon in both hands is barred. (If there's no main-hand weapon, e.g. an unarmed main attack, the off-hand trivially differs and the guard is a no-op.)

## Affordance layer

The `off-hand-attack` bonus-action affordance (`owns: wieldsLightWeapon`, `requiresWeapon: true`) surfaces "off-hand attack available" whenever a Light weapon is wielded and lets the **consumer supply** the off-hand `weaponInstanceId` — by design a seam, with the planner as the authoritative gate. The pattern-check surfaced that the slice-762 affordance test exercised a **RAW-invalid** loadout (a single dagger, off-hand attack made with that same main-hand instance); it was corrected to a real two-dagger dual-wield (strike with the off-hand instance). No affordance-code change — surfacing the option on any Light weapon and gating the specific weapon in the planner is the intended split.

## What shipped

New 2-test `tests/unit/engine/slice-860-offhand-different-weapon.test.ts`: an off-hand attack made with the main-hand weapon instance throws (`/different Light weapon/`); an off-hand attack with a different Light weapon instance — including a second dagger of the *same type* — produces an `AttackRolled` (two-of-a-kind dual-wield stays legal). The slice-762 `bonus-actions` test updated to a two-dagger loadout. All existing off-hand tests (`plan-offhand-twf`, the mastery cleave/nick, halfling-luck sweeps, the showcase golden) stay green — they already wield a distinct off-hand weapon.

## Verification

`npx tsc --noEmit` clean; new 2-test slice-860 green; the corrected slice-762 + every off-hand-path test green. No content / condition / coverage-snapshot change. `npm run test:fast` (638 files, 4806 passed) + doc audits green.
