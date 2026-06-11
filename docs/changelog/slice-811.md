# Slice 811 — player-facing `description` cleanup (rules text vs engine notes)

**Type:** Schema field + content (480 description fields) + a content-lint test. **Driven by** dnd-web's tap-to-read rules feature, which now shows content `description` verbatim to players — so `description` is an end-user string, not a dev annotation.

## The problem

~247 of the 480 shipped `description` fields mixed SRD rules text with engineering notes — `Slice <n>` changelog refs, `RAW (SRD …):` citation wrappers, and consumer/implementation commentary. A player tapping Boots of Elvenkind read *"RAW (SRD 5.2.1): '…' Slice 297 wired the Stealth arm via slice-263's …"*.

## Approach — Option A + `engineNotes`

- **`description` is now clean player-facing SRD-style rules text.** New optional **`engineNotes`** field (added to SpellSchema, ItemBaseSchema, ConditionSchema, ClassFeatureSchema) holds the dev annotation — not shown to players. For every cleaned field, `engineNotes` is the **full original** string, so **no information is lost** and the clean extract is always recoverable/refinable.
- **No consumer change needed** — consumers already read `description`.

## What got cleaned

The real scope (vs the task's estimate): **480 description fields on items (324), conditions (153), and 3 class/subclass features. Spells carry no `description` at all** — adding spell rules text is a *separate* gap (tracked, not this slice). Of the 480, **247 were dirty** by the lint's exact markers (`/Slice \d/`, `/\bRAW\b/`, `/consumer/`); the task's 382 also counted lowercase `raw`/`slice` as normal English words, which are fine.

A scripted, dry-run-first transform did the split (regex-assisted, then spot-checked):
- **RAW-wrapped** → keep the rules text, drop the `RAW (…):` wrapper + the `Slice <n>` notes (leading flavor is kept where present — it reads better than the bare quote).
- **Slice-only** → truncate at the first `Slice <n>`.
- **`consumer` as the potion-drinker** ("if the consumer attacks") → reworded to "the creature" (engine-author phrasing, not a note).
- **32 internal marker conditions** (Beacon of Hope buff, Slow, Levitate, Blink markers, etc.) whose entire `description` was an engine note → empty `description` (their player-facing rules live on the *spell*, not the internal condition).

## Tests

New `tests/audit/player-facing-descriptions.test.ts` — walks every player-facing `description` (skipping `engineNotes`) and fails on `/Slice \d/`, `/\bRAW\b/`, or `/consumer/`, so the cleanup can't regress. It was landed red (170 Slice / 171 RAW / 122 consumer) and the content cleaned until green.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (594 files, 4551 passed) — no golden transcript or mechanical test touched (the engine event log doesn't embed `description`; acceptance #3). The starter-pack.json diff is 248 lines in place, no reformatting.
