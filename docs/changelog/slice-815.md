# Slice 815 — NPC bonus-action spell group: Cultist Fanatic Spiritual Weapon

**Type:** Content (one grant) + a 4-test pin + audit re-scope. **Partially closes** the [L7 audit](../l7-completion-audit.md) `npc-caster-bonus-action-groups` quirk (Area 7) — the one item that needs zero engine work.

## The row, triaged

The slice 794/814 sweep covered each caster's core *Spellcasting* **action**. Several casters also print a second, **bonus-action / reaction spell group**. Auditing what each actually needs:

| Group | Caster(s) | Needs |
|---|---|---|
| **Spiritual Weapon 2/Day** | Cultist Fanatic | **Nothing** — intrinsic Bonus-Action spell on the generic `castSpell` path. ✅ this slice. |
| Misty Step 3/Day | Mage, Archmage | An engine seam: `planMistyStep` consumes a *slot* and recognizes only known/prepared spells, so a slot-less monster can't meter it per-day. |
| Divine Aid 3/Day | Priest | An engine seam: a *shared* 3/Day pool across 4 spells (`perDayCastsUsed` is per-spell) + Bless/Dispel Magic cast as a Bonus Action (cast-time override). |
| Protective Magic 3/Day | Mage, Archmage | The monster reaction seam (Counterspell / Shield reactions). |
| Tree Stride | Dryad | Not a spell — a teleport movement ability. |

A correction to the slice-814 audit note: it claimed Misty Step could ride `GrantSpell{perLongRest}` on `castSpell`. That's wrong — Misty Step has a **dedicated** `planMistyStep` (it needs a destination + does the teleport) that consumes a slot, so it is *not* on the generic per-day path. Row updated.

## What shipped

`spiritual-weapon` added to the Cultist Fanatic as `GrantSpell{ preparation: 'perLongRest', usesPerLongRest: 2 }` — its RAW *Spiritual Weapon (2/Day)* bonus action (`references/srd-markdown/monsters-A-Z.md`). It needs no new engine code: Spiritual Weapon's casting time **is** a Bonus Action, so the existing `castSpell` path consumes the bonus action from the casting time, and `useFreeCast` meters it against the slice-794 `perDayCastsUsed` counter (exactly as the cultist's Command / Hold Person already do).

## A divergence surfaced (tracked, not fixed here)

Casting Spiritual Weapon **at a target** consumes the **Action** too, not just the Bonus Action. RAW the immediate attack is *part of* the Bonus-Action cast (no separate Action); `cast-spell.ts`'s `consumesImplicitMagicAction` — built for Produce Flame, whose *hurl* genuinely is a separate Magic action — over-fires for any BA spell with an attack mechanic + non-instant duration + a target. This is **pre-existing** and hits every Spiritual Weapon caster (cleric, player, monster), so it's an engine fix, not content: tracked as `spiritual-weapon-immediate-attack-action-cost`. The test pins today's behavior so a fix flips it deliberately.

## Tests

`tests/unit/engine/slice-815-npc-bonus-action-spiritual-weapon.test.ts` (4): the grant ships as 2/Day with `castingTime === 'Bonus Action'`; metered end-to-end (2/Day, no slot, third blocked); a pure summon (no target) spends **only** the bonus action; and a cast-with-attack spends the bonus action **and** the implicit Magic action (the characterized divergence above).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green — additive content + tests only, no mechanical change to any existing caster.
