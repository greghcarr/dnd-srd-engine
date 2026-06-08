// Slice 749: a small reactions matrix under the fuzz/replay audit. The
// positionless fuzz-matrix proves default battles complete + replay; this
// runs the reaction-policy code paths (reactions:'auto') through the same
// audit so a rule violation in a reacting battle surfaces as a throw or a
// replay divergence, and a positive-presence aggregate proves the
// damage-mitigation reactions actually fire (not silently degraded by the
// backstop catch).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle, type FuzzVs } from '../../scripts/combat-fuzz-core.js';
import { replay } from '../../src/engine/replay.js';

const STARTER = loadStarterPack();
// Level 7: Rogue (Uncanny Dodge, L5) and Monk (Deflect Attacks, L3) both
// have their reactions. Seeds chosen to span Uncanny-Dodge and
// Deflect-Attacks firing across the configs.
const LEVEL = 7;
const SEEDS = [1, 2, 7, 10, 12, 14, 16];
const CONFIGS: Array<{ teamSize: number; vs: FuzzVs }> = [
  { teamSize: 1, vs: 'pc' },
  { teamSize: 2, vs: 'pc' },
  { teamSize: 2, vs: 'monster' },
];

describe('fuzz reactions matrix (slice 749)', () => {
  it('every reacting battle completes, advances rounds, and replays equivalently', () => {
    for (const { teamSize, vs } of CONFIGS) {
      for (const seed of SEEDS) {
        const label = `seed=${seed} teamSize=${teamSize} vs=${vs}`;
        const r = runBattle({ seed, pack: STARTER, level: LEVEL, teamSize, vs, reactions: 'auto' });
        expect(r.rounds, `${label} advanced no rounds`).toBeGreaterThan(0);
        expect(JSON.stringify(replay(r.campaign.events)), `${label} replay mismatch`).toBe(
          JSON.stringify(r.campaign.state),
        );
      }
    }
  });

  it('positive presence: the matrix actually fires Uncanny Dodge and Deflect Attacks', () => {
    let uncannyDodge = 0;
    let deflectAttacks = 0;
    for (const { teamSize, vs } of CONFIGS) {
      for (const seed of SEEDS) {
        const r = runBattle({ seed, pack: STARTER, level: LEVEL, teamSize, vs, reactions: 'auto' });
        uncannyDodge += r.campaign.events.filter((e) => e.type === 'UncannyDodgeUsed').length;
        deflectAttacks += r.campaign.events.filter((e) => e.type === 'DeflectAttacksUsed').length;
      }
    }
    expect(uncannyDodge, 'no Uncanny Dodge fired across the whole matrix').toBeGreaterThan(0);
    expect(deflectAttacks, 'no Deflect Attacks fired across the whole matrix').toBeGreaterThan(0);
  });
});
