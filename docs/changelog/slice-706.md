# Slice 706 — refactor: graduate the tactical enemy policy to the package (interactive-play A3)

**Type:** Refactor (file relocation + re-export shims). No behavior change; no event schema change; tactical transcripts byte-identical.

Part A3 of interactive-play support: for a shipping game, the browser (the dnd-web interactive viewer) should drive an AI combatant by importing the tactical policy **from the package**, not from `scripts/`. This graduates the pure decision logic into `src/ai/`.

## What moved

The pure, RNG-free tactical policy + its tunables moved from `scripts/tactical/` into the package:

- `scripts/tactical/policy.ts` → **[src/ai/tactical-policy.ts](../../src/ai/tactical-policy.ts)** (`planTacticalMove`, `classifyTacticalRole`, `pickByTotalOrder`, types).
- `scripts/tactical/constants.ts` → **[src/ai/tactical-constants.ts](../../src/ai/tactical-constants.ts)** (policy + arena tunables).

The package barrel ([src/index.ts](../../src/index.ts)) now exports the policy via **[src/ai/index.ts](../../src/ai/index.ts)**: `planTacticalMove`, `classifyTacticalRole`, `pickByTotalOrder`, and the `TacticalRole` / `TacticalRoleKind` / `TacticalMove` / `TacticalMoveInput` types. The internal tunables are intentionally NOT barrel-exported.

## Why it's byte-identical

`scripts/tactical/policy.ts` and `scripts/tactical/constants.ts` are now thin re-export shims (`export * from '../../src/ai/...'`), so every existing consumer keeps its import path unchanged and gets the same symbols:

- `scripts/combat-fuzz-core.ts` (imports `makeTacticalMovePolicy`, `emitTacticalSetup`), `scripts/tactical/move-policy.ts` (imports the policy from `./policy.js`), `scripts/tactical/arena.ts` + `setup.ts` (import tunables from `./constants.js`) — all unchanged.
- The fuzz tests `tests/unit/tactical-policy.test.ts` + `tests/unit/tactical-arena.test.ts` keep importing from `scripts/tactical/*` (now shims).

The relocated code is identical (only `import` paths adjusted from `../../src/...` to `../...` and the constants import to `./tactical-constants.js`). Arena tunables (`MAP_SALT`, `ARENA_DIMS`, densities, fence) are unchanged, so the arena RNG stream and generated maps are identical; the policy decision logic is unchanged, so `planTacticalMove` returns the same destinations. The golden tactical-movement transcript + the fuzz-tactical determinism guards confirm byte-identity.

## What stayed in scripts/

`pickIntent` (the per-turn intent chooser) and `makeTacticalMovePolicy` (the engine-orchestration `MovePolicy` that commits move/disengage/opportunity-attack events) stay in `scripts/combat-fuzz-core.ts` + `scripts/tactical/move-policy.ts`: both are coupled to the fuzz harness's `Combatant` / `Engine` / `MovePolicyContext` types (which carry the fuzz-only `built` bundle). Relocating them cleanly means first decoupling those harness types — a separate follow-up. The pure decision core (the part a browser most needs to drive an AI combatant's movement) is what graduated here.

## Import path (handoff)

```ts
import { planTacticalMove, classifyTacticalRole } from 'dnd-srd-engine';
// (was: import { planTacticalMove } from '@engine-fuzz' → scripts/tactical/policy.ts)
```

## Files

- New: [src/ai/tactical-policy.ts](../../src/ai/tactical-policy.ts), [src/ai/tactical-constants.ts](../../src/ai/tactical-constants.ts), [src/ai/index.ts](../../src/ai/index.ts).
- Shims: [scripts/tactical/policy.ts](../../scripts/tactical/policy.ts), [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts).
- Barrel: [src/index.ts](../../src/index.ts).
- [tests/contract/__snapshots__/exports.test.ts.snap](../../tests/contract/__snapshots__/exports.test.ts.snap): new public names (`-u`, intended additions only).
- [docs/api-overview.md](../../docs/api-overview.md): tactical AI export noted.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green — tactical-policy + tactical-arena unit tests, the golden tactical-movement transcript, and the fuzz-tactical determinism guards all pass unchanged (the byte-identity proof).
- No existing event schema changed.

## Audit (Uncle Bob)

- **Move, don't rewrite**: the relocated code is identical bar import paths; the shims preserve every existing import site, so the diff is a pure relocation.
- **SRP / layering**: `src/ai/` is a leaf module (depends only on `src/derive` + schemas); nothing in the engine core imports it, so engine behavior is untouched. `scripts/` → `src/` is the correct dependency direction (the prior `src` had no `scripts` dep, and still doesn't).
- **Minimal public surface**: only the policy functions + types are barrel-exported; the arena/tuning constants stay internal.
- **Pattern-check**: searched every importer of `scripts/tactical/policy` + `scripts/tactical/constants` (combat-fuzz-core, move-policy, arena, setup, the two unit tests) — all covered by the shims; none needed editing.

## Open follow-ups

- `pickIntent` + `makeTacticalMovePolicy` graduation (needs the fuzz `Combatant`/`Engine` types decoupled first).
- Arena generation (`scripts/tactical/arena.ts` `generateArenaMap`) is still scripts-only; if a consumer needs to generate tactical maps from the package, that's a sibling graduation.
