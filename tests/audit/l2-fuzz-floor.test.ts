// Slice 643: L2 fuzz floor — seeded encounter sweep.
//
// Fifth and last of the L2 hardening slices. The four previous
// hardening slices pin static invariants (feature ids, planner
// presence, resource max + recharge, spell-wired floor, multiclass
// build cleanliness). None of them exercise the engine end-to-end:
// a planner could throw mid-turn, an action-economy reset could
// desync, a reaction could fire in the wrong slot, and the static
// audits wouldn't notice until a per-feature unit test catches it
// (or a real campaign blows up).
//
// This audit drives the existing combat-fuzz harness
// (scripts/combat-fuzz-core.ts) at L2: 20 seeded 1v1 PC-vs-PC
// battles. Each battle runs to completion (someone drops to 0 HP)
// or hits MAX_ROUNDS (20). The audit's invariant: every battle
// completes without throwing.
//
// What this audit catches:
//   - A planner that throws on a previously-valid intent.
//   - A reducer that violates an invariant under L2 conditions.
//   - An RNG-stream desync that produces an invalid event.
//   - A new condition / effect that the apply pipeline can't apply.
//
// What it does NOT catch:
//   - RAW-correctness of individual mechanics (per-feature unit
//     tests own that).
//   - Per-seed reproducibility (transcript byte-stability is the
//     fuzz CLI's job; see scripts/combat-fuzz.ts).
//   - Soft balance issues ("Warlock always wins at L2"). The audit
//     accepts any winner (or no winner on a draw); it only cares
//     that the engine runs.
//
// Seed count tuning: 20 seeds is light by fuzz standards (the L1
// cycle's slices 620-627 ran thousands), but it's the right shape
// for a CI guard: enough to surface "the engine throws on a common
// L2 path" within seconds, not enough to inflate CI duration. The
// fuzz CLI remains the harness of choice for deep multi-seed
// regression hunts.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';

const PACK = loadStarterPack();
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const LEVEL = 2;

describe('slice 643: L2 fuzz floor (seeded encounter sweep, no thrown errors)', () => {
  for (const seed of SEEDS) {
    it(`L${LEVEL} 1v1 PC-vs-PC, seed ${seed}: runs to completion without throwing`, () => {
      let result;
      try {
        result = runBattle({
          seed,
          pack: PACK,
          level: LEVEL,
          rest: 'none',
          teamSize: 1,
          vs: 'pc',
        });
      } catch (err) {
        // Re-throw with the seed in the message so a regression
        // points at the exact reproduction.
        throw new Error(
          `combat-fuzz threw on L${LEVEL} seed=${seed}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      expect(result, `seed ${seed} returned no result`).toBeDefined();
      // `winner: null` is a valid outcome (draw / round cap); the
      // audit only cares the engine ran to a clean stopping point.
      expect(typeof result.rounds, `seed ${seed} rounds not finite`).toBe('number');
      expect(result.rounds).toBeGreaterThan(0);
    });
  }
});
