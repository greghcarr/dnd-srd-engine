# Slice 817 — Misty Step per-day enabler (slot-less NPC casters)

**Type:** Engine primitive (a `useFreeCast`/per-day branch on `planMistyStep`) + canonical content (Mage + Archmage *Misty Step* 3/Day). Advances the [L7 audit](../l7-completion-audit.md) `npc-caster-bonus-action-groups` quirk.

## The gap

Misty Step has a **dedicated** planner — `planMistyStep` (in `movement.ts`) — because it needs a destination and performs the teleport, so it's off the generic `castSpell` path. That planner always expended a spell **slot** and recognized the spell only via `knownSpells` / `preparedSpells`. So a slot-less NPC caster — the Mage and Archmage, whose statblocks print "Misty Step (3/Day)" as a Bonus Action — could not cast it: it has no slot to spend and its bucket lives in an effect-stack `GrantSpell`, not a class spell list. (Slice 815 correctly flagged this as the one bonus-action item that genuinely needs an engine seam, not content.)

## The enabler

`planMistyStep` gained a `useFreeCast` path that mirrors `castSpell`'s slice-794 per-day machinery, kept local to the one dedicated planner:

- **Granted-spell recognition.** A Misty Step granted through the effect stack now satisfies the "knows the spell" check (alongside known/prepared). The effect stack is built **lazily** — only for a free cast or a caster who doesn't already know Misty Step — so the common player slot cast pays nothing extra.
- **Per-day metering.** With `useFreeCast`, the planner resolves the `perLongRest` ("N/Day") grant, checks `perDayCastsUsed['misty-step']` against `usesPerLongRest`, and emits **`PerDayCastUsed`** instead of `SpellSlotConsumed` (no slot). The Bonus Action + the teleport (`CombatantMoved`) are unchanged.

New `MistyStepIntent.useFreeCast?: boolean`; the existing `engine.plan.mistyStep` wiring already spreads the intent, so it flows through with no API change. The slot path (players) is byte-identical.

## Content

`misty-step` added to the **Mage** and **Archmage** as `GrantSpell{ preparation: 'perLongRest', usesPerLongRest: 3 }` — their RAW "Misty Step (3/Day)" Bonus Action (`monsters-A-Z.md`).

## Uncle Bob audit

- **Single responsibility:** the per-day branch sits beside the existing slot logic in the one planner that owns Misty Step; it doesn't leak into the generic cast path or duplicate a planner.
- **DRY without premature abstraction:** mirrors the established slice-794 free-cast shape (resolve grant → check `perDayCastsUsed` budget → emit `PerDayCastUsed`) rather than inventing a second metering model; a shared helper wasn't extracted because the two call sites differ in their surrounding gates (teleport vs generic cast) and a forced abstraction would couple them.
- **No new coupling / events:** reuses `PerDayCastUsed`, `buildEffectStack`, and `grantedSpells()`; no new event, effect kind, or schema (the intent field is a TS interface).
- **Pay-for-what-you-use:** the effect stack is built lazily so the hot player slot path is unaffected.
- **Tests pin behavior:** the per-day cast (teleport + PerDayCastUsed, no slot, metered), the 3/Day budget gate, granted-spell recognition, and the no-grant rejection — plus the existing slot path stays green.

## Tests

`tests/unit/engine/slice-817-misty-step-per-day.test.ts` (4): the Mage + Archmage ship the 3/Day grant; a slot-less Mage casts it (PerDayCastUsed, no `SpellSlotConsumed`, a `CombatantMoved` teleport, bonus action spent, `perDayCastsUsed` incremented); the 3/Day budget blocks a Mage who has spent all three; and `useFreeCast` on a caster who knows Misty Step but has no per-day grant is rejected. The existing `plan-misty-step.test.ts` (sorcerer slot cast) stays green unchanged.

## Verification

`npx tsc --noEmit` clean; coverage/exports snapshots unchanged; `npm run test:fast` green (599 files, 4587 passed).
