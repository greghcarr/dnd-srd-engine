# Slice 813 — player-facing rules text for every spell (`description`)

**Type:** Content sweep (339 spell descriptions) + a presence/length regression guard. **Driven by** dnd-web's tap-to-read rules feature (the same surface slice 811 cleaned for items/conditions): it shows a content `description` verbatim to players.

## The gap

Slice 811 established that `description` is an end-user string and cleaned items (324) + conditions (153). But **spells carried no `description` at all** — every spell already had structured mechanics (`SpellAttackMechanic`, save DCs, etc.) that the engine executes, but nothing human-readable for a consumer to show. Tapping a spell in dnd-web rendered a blank rules panel. Slice 811 explicitly tracked this as a separate gap; this slice closes it.

## Approach — extract from SRD canon, additively

- Source: **`references/srd-markdown/spells.md`** (the CC-BY-4.0 SRD 5.2.1 clone — the only valid rules source; never web). All 339 spells matched by normalized name (then id as a fallback); **0 misses**.
- A scripted, verify-after extraction pulled each spell's body: dropped the `_School (level)_` italic line and the `**Casting Time / Range / Components / Duration**` metadata block (those are separate structured fields / out of scope for the rules panel), stripped markdown (`**bold**`, `_italics_`, `<br>`, `&emsp;`, table pipes) and collapsed whitespace, leaving clean prose. "Using a Higher-Level Spell Slot" / "Cantrip Upgrade" upcast notes are kept inline as prose.
- **Additive only.** `description` is a display field; no mechanic, planner, event, or DC changed. The engine event log doesn't embed `description`, so no golden transcript moves.
- The text is **2024-edition-faithful** by construction (the source is the 5.2.1 clone) — e.g. Sleep reads as the WIS-save/Incapacitated spell and Color Spray as the CON-save/Blinded cone, matching slices 783/784, not their 2014 forms.

## Scope

339/339 spells now carry a `description` (min/avg/max length 70 / 700 / 3626 chars; 0 empty). The full original markdown was not needed in `engineNotes` — the extraction is the player text and the SRD clone remains the canonical source.

## Tests

- New **`tests/audit/spell-descriptions.test.ts`**: fails if any spell loses its `description` or carries a `< 40`-char one (an extraction regression). 3 assertions.
- The slice-811 **`player-facing-descriptions`** lint already walks every `description` in the pack, so it now also guards the 339 spell descriptions against `Slice <n>` / `RAW` / `consumer` artifacts — 0 offenders.

## Verification

`npx tsc --noEmit` clean; spell-descriptions (3) + player-facing-descriptions (4) green; `npm run test:fast` green — no mechanical or golden change (additive display field only). No new wired mechanics, so the coverage/exports snapshots are unchanged.
