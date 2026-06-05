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
