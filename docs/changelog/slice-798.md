# Slice 798 — armor Stealth disadvantage

**Type:** Engine derivation (read an authored-but-ignored field). **Closes** the [L7 audit](../l7-completion-audit.md) Area 6 divergence `armor-stealth-disadvantage`.

## The gap

Every armor entry in the pack carries a `stealthDisadvantage` boolean (RAW `equipment.md`: Padded, Scale Mail, Half Plate, Ring Mail, Splint, Chain Mail, Plate impose Disadvantage on Dexterity (Stealth) checks while worn) — but **nothing read it**. A Rogue in Splint rolled Stealth at full proficiency, no penalty. A flatly-wrong, high-frequency, expert-visible rule.

## The fix

`computeAbilityCheck` (`src/derive/ability-check.ts`) now resolves the bearer's equipped armor — the same `equipped.armor` instance → `content.items` definition path `computeAC` already uses — and, for a `stealth`-skill check, OR-s `armorDef.stealthDisadvantage` into the check's `disadvantage`. Scope:

- Gated on `input.skill === 'stealth'` only — a raw DEX check or DEX (Acrobatics) while wearing the armor is unaffected.
- Shields don't carry the flag (the armor variant's field), so a shield alone never triggers it.
- Flows through `computePassiveScore` automatically, so passive Stealth takes the −5.

No new schema, no content change, no new condition — purely reading a field that was already there.

## Tests

`tests/unit/derive/slice-798-armor-stealth-disadvantage.test.ts` (6): Splint imposes Stealth disadvantage; Scale Mail / Half Plate / Ring Mail / Padded all do; Studded Leather / Breastplate (flag `false`) and no-armor do not; the disadvantage is Stealth-specific (Acrobatics + raw DEX checks unaffected); and the flat modifier is unchanged (the penalty lives at the advantage layer / passive −5).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (581 files, 4497 passed) — no existing Stealth assertion regressed.
