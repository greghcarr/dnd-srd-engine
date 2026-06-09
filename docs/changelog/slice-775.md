# Slice 775 — L7 SRD-completion audit (tracking doc)

**Type:** Docs / workflow. New master worklist; no code change.

## Why

The engine's class/subclass *features* are SRD-complete and CI-guarded through L7 (`srd-l{1..7}-complete` floor audits), but "a consumer like dnd-web runs a full L1-7 game and a D&D expert sees zero divergences — including input handling and targeting" is a stronger claim with a real tail the floor audits don't exercise: spell mechanical arms, the targeting/AoE seam, edition-drift bugs, build-choice validation, item/monster content, and the exploration pillar. We needed a finite, durable list of those areas to drive systematically.

## How

[docs/l7-completion-audit.md](../l7-completion-audit.md) — the master worklist. Compiled from a 7-agent parallel audit cross-referencing the SRD canon clone (`references/srd-markdown/`), the engine code, the test suite, and the `docs/gaps-*` catalogs. ~95 distinct findings across **9 areas**, each tagged severity (`BLOCKER` / `DIVERGENCE` / `QUIRK`), owner (`Engine` / `Seam` / `Consumer` / `Docs`), and fix size, with file/line evidence:

1. Edition drift (2014 rules still applied) · 2. Spell mechanics L0-4 · 3. Targeting / AoE seam · 4. Core combat correctness · 5. Build & leveling validation · 6. Base equipment mechanics · 7. Monster runtime · 8. Exploration / non-combat · 9. Consumer duties & docs.

Four headline edition-drift items are `[canon-verified]` against the SRD markdown (long rest restores all HD not half; Sleep + Color Spray are saves not 2014 HP-pool; the 2014 Small-creature Heavy-weapon rule was removed in 2024). Two structural items carry a `[verify]` ownership/canon flag (`background-ability-bonus`, `heavy-property-str-dex`). A "Confirmed correct / by-design" appendix records what was checked and is *not* a work item, so future audits don't re-flag it (the floor-audited features, the 2024 exhaustion model, grapple/shove's 2024 save mechanic, multiclass slot math, the deliberate consumer seams).

Discoverability: linked from [CLAUDE.md](../../CLAUDE.md)'s pointer table. The doc uses the repo's strike-through + "Closed by slice N" convention as items close; closure annotations are not in scope for this slice.

The audit also surfaced a meta-finding now noted in the doc: [gaps-monsters-deferred-mechanics.md](../gaps-monsters-deferred-mechanics.md) is materially stale (multiattack, on-hit riders, breath recharge, pack tactics, at-will spells have all shipped), so the monster gap is overwhelmingly content population, not missing primitives.

## Status

No engine change; doc audits (size / links / counts) green. The worklist is the durable artifact; execution proceeds slice-by-slice from Area 1 (edition drift) and the structural blockers (`aoe-shape-coverage`, `no-actions-field` + `multiattack-unpopulated`, `no-hit-die-spend-planner`, `background-ability-bonus`).
