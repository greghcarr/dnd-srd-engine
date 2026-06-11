# Slice 820 — Dryad Tree Stride (the last bonus-action-group item)

**Type:** Engine (new effect marker + dedicated planner + wiring) + content (the Dryad). **Fully closes** the [L7 audit](../l7-completion-audit.md) `npc-caster-bonus-action-groups` quirk — and it's the only item of the five that isn't a spell.

## The ability

RAW (SRD 5.2.1 Dryad), Bonus Action: *"If within 5 feet of a Large or bigger tree, the dryad teleports to an unoccupied space within 5 feet of a second Large or bigger tree that is within 60 feet of the previous tree."*

The **trees are terrain the engine doesn't model** (it tracks positions; terrain features are consumer-managed — [docs/engine-scope.md](../engine-scope.md)). So the two "within 5 ft of a Large+ tree" constraints are consumer-validated; the engine owns the rest: the bearer has Tree Stride, it's their turn with a Bonus Action free, and the destination is within 60 ft and unoccupied. This is the same consumer-seam shape `planCloudsJaunt` documents for its "you can see it" clause.

## The design

Mirrors `planCloudsJaunt` (a monster Bonus-Action teleport), minus the resource:

- **New `GrantTreeStride` marker effect** — a zero-arg ability marker (parallel to the Dryad's existing `GrantMagicResistance`): union member + zod variant + `EFFECT_KINDS` entry + a `markTreeStride()`/`hasTreeStride()` accumulator flag in the effect builder. Gates the ability data-drivenly (a homebrew fey could carry it) rather than hardcoding the statblock id.
- **New `planTreeStride` planner** (`src/engine/plan/tree-stride.ts`) — checks `hasTreeStride()`, active turn, Bonus Action free, position, ≤ 60 ft (Chebyshev, matching `planMistyStep`), and an unoccupied destination; emits `ActionEconomyConsumed(bonusAction)` + `CombatantMoved` (teleport, `feetTraveled: 0` so it doesn't drain normal movement). No resource — Tree Stride is at-will given suitable trees. Wired as `engine.plan.treeStride` and allowlisted in the planner-wiring audit (consumer-orchestrated, like `mistyStep`).

## Content

The Dryad statblock gains `{ "kind": "GrantTreeStride" }`.

## Uncle Bob audit

- **Consistency over novelty:** reuses the two established shapes — the zero-arg ability-marker effect (`GrantMagicResistance`) and the monster Bonus-Action teleport planner (`planCloudsJaunt`) — rather than inventing a new mechanism.
- **Single responsibility / engine-scope respected:** the planner enforces only what the engine owns (turn, economy, range, occupancy); the tree-adjacency stays a documented consumer seam, not a half-modeled terrain feature.
- **Data-driven gate:** `GrantTreeStride` + `hasTreeStride()` instead of `statblockId === 'dryad'`.
- **No new event:** reuses `ActionEconomyConsumed` + `CombatantMoved`.
- **Tests pin behavior:** the teleport (BA + move, no movement drain, position updates), the 60 ft range gate, occupancy, bonus-action-already-spent, and the not-a-Tree-Strider rejection.

## Docs

Adding an `EFFECT_KINDS` entry bumped the source-derived effect-kind count (68 → 69 total / 67 → 68 primitives), so the `doc-counts` audit's six front-door citations (README ×3, authoring-content-packs, concepts, status, architecture, api-overview) were updated.

## Tests

`tests/unit/engine/slice-820-tree-stride.test.ts` (6): the Dryad ships the marker; a Bonus-Action teleport up to 60 ft updates position without draining movement; a destination > 60 ft, an occupied cell, a spent Bonus Action, and a creature without Tree Stride each throw.

## Milestone

With this, **`npc-caster-bonus-action-groups` is fully closed** (slices 815-820). The remaining follow-up is the additive `npc-reaction-discovery` query-layer seam (surfacing the monster reaction groups in `availableReactions`).

## Verification

`npx tsc --noEmit` clean; coverage/exports/phantom-field snapshots unchanged; `npm run test:fast` green.
