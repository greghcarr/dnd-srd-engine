// Slice 695: a small tactical matrix under the fuzz/replay audit. The
// positionless fuzz-matrix proves 'none' battles complete + replay; this
// runs the movement/range/LoS/OA code paths through the same audit so a
// rule violation in a tactical battle surfaces as a throw or a replay
// divergence, not just a determinism-golden miss.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle, type FuzzVs } from '../../scripts/combat-fuzz-core.js';
import { replay } from '../../src/engine/replay.js';

const STARTER = loadStarterPack();
const SEEDS = [1, 2, 3, 4, 5, 6, 8, 10, 11, 14];
const CONFIGS: Array<{ teamSize: number; vs: FuzzVs }> = [
  { teamSize: 1, vs: 'pc' },
  { teamSize: 2, vs: 'pc' },
  { teamSize: 2, vs: 'monster' },
];

describe('fuzz tactical matrix (slice 695)', () => {
  it('every tactical battle completes, advances rounds, and replays equivalently', () => {
    for (const { teamSize, vs } of CONFIGS) {
      for (const seed of SEEDS) {
        const label = `seed=${seed} teamSize=${teamSize} vs=${vs}`;
        const r = runBattle({ seed, pack: STARTER, teamSize, vs, movement: 'tactical' });
        expect(r.rounds, `${label} advanced no rounds`).toBeGreaterThan(0);
        expect(r.movement).toBe('tactical');
        expect(r.locationId, `${label} missing locationId`).toBeDefined();
        expect(JSON.stringify(replay(r.campaign.events)), `${label} replay mismatch`).toBe(
          JSON.stringify(r.campaign.state),
        );
      }
    }
  });

  it('positive presence: the matrix actually exercises movement and opportunity-attack paths', () => {
    // Aggregate over the matrix (not just "didn't crash"): movement must
    // occur, and at least one move must provoke a resolved OA — proving the
    // OA path fired rather than being silently degraded by a backstop catch.
    let moved = 0;
    let resolvedOAs = 0;
    for (const { teamSize, vs } of CONFIGS) {
      for (const seed of SEEDS) {
        const r = runBattle({ seed, pack: STARTER, teamSize, vs, movement: 'tactical' });
        moved += r.campaign.events.filter((e) => e.type === 'CombatantMoved').length;
        resolvedOAs += r.campaign.events.filter(
          (e) => e.type === 'AttackRolled' && (e as { isOpportunityAttack?: boolean }).isOpportunityAttack === true,
        ).length;
      }
    }
    expect(moved, 'no CombatantMoved across the whole matrix').toBeGreaterThan(0);
    expect(resolvedOAs, 'no opportunity attack resolved across the whole matrix').toBeGreaterThan(0);
  });
});

// Slice 697: tactical battles must converge to a decisive outcome, not
// stalemate at the round cap. Before slice 697 the kite/flee heuristics let
// combatants camp opposite arena edges and hit the cap; the round standoff
// leash forces the gap down to melee. This pins the draw rate well under the
// 5% bar and the specific seed the consumer reported (42, 1v1).
const CONVERGENCE_SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const MAX_DRAW_RATE = 0.03; // observed 0% over this matrix; baseline was 5%.

describe('tactical convergence (slice 697)', () => {
  it(`draw rate stays under ${(MAX_DRAW_RATE * 100).toFixed(0)}% across seeds 1-40 x {1v1, 2v2}`, () => {
    let battles = 0;
    let draws = 0;
    for (const teamSize of [1, 2]) {
      for (const seed of CONVERGENCE_SEEDS) {
        const r = runBattle({ seed, pack: STARTER, level: 1, teamSize, movement: 'tactical' });
        battles += 1;
        if (r.winner === null) draws += 1;
      }
    }
    expect(draws / battles, `${draws}/${battles} battles drew (hit the round cap)`).toBeLessThanOrEqual(MAX_DRAW_RATE);
  });

  it('seed 42 1v1 resolves to a winner (the consumer-reported stalemate)', () => {
    const r = runBattle({ seed: 42, pack: STARTER, level: 1, teamSize: 1, movement: 'tactical' });
    expect(r.winner, 'seed 42 1v1 still draws').not.toBeNull();
  });
});
