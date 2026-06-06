// Slice 695: golden determinism + behavior test for tactical movement.
// Mirrors s10-movement's replay-equivalence discipline but over whole
// fuzz battles: the tactical log replays to the same state, two same-seed
// runs are identical (modulo volatile ids/timestamps), the tactical events
// (location, movement, positioned encounter, resolved opportunity attacks)
// are present, and the default movement:'none' path emits none of them.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';
import { replay } from '../../src/engine/replay.js';
import { normalizeEvents } from '../fixtures/index.js';

const STARTER = loadStarterPack();
const SEEDS = [1, 2, 3, 5, 7, 10, 11, 42];

const types = (r: ReturnType<typeof runBattle>): string[] => r.campaign.events.map((e) => e.type);

describe('golden: tactical movement (slice 695)', () => {
  it('the tactical event log replays to the same state, every seed', () => {
    for (const seed of SEEDS) {
      for (const teamSize of [1, 2]) {
        const r = runBattle({ seed, pack: STARTER, teamSize, movement: 'tactical' });
        expect(
          JSON.stringify(replay(r.campaign.events)),
          `replay mismatch seed=${seed} teamSize=${teamSize}`,
        ).toBe(JSON.stringify(r.campaign.state));
      }
    }
  });

  it('two same-seed tactical runs are identical (normalized)', () => {
    for (const seed of [3, 10, 42]) {
      const a = runBattle({ seed, pack: STARTER, teamSize: 2, movement: 'tactical' });
      const b = runBattle({ seed, pack: STARTER, teamSize: 2, movement: 'tactical' });
      expect(normalizeEvents(a.campaign.events)).toEqual(normalizeEvents(b.campaign.events));
    }
  });

  it('tactical mode emits LocationCreated, CombatantMoved, and a positioned EncounterCreated', () => {
    for (const seed of SEEDS) {
      const r = runBattle({ seed, pack: STARTER, teamSize: 2, movement: 'tactical' });
      const t = types(r);
      expect(t, `seed=${seed}`).toContain('LocationCreated');
      expect(t, `seed=${seed}`).toContain('CombatantMoved');
      const enc = r.campaign.events.find((e) => e.type === 'EncounterCreated')!;
      expect((enc as { combatants?: unknown }).combatants, `seed=${seed}`).toBeDefined();
    }
  });

  it('opportunity attacks fire when a move provokes (deterministic anchors)', () => {
    // seed 5 / seed 10 at 2v2 deterministically produce kiters leaving a
    // melee enemy's reach; the policy resolves the provoked OAs.
    for (const seed of [5, 10]) {
      const r = runBattle({ seed, pack: STARTER, teamSize: 2, movement: 'tactical' });
      const oas = r.campaign.events.filter(
        (e) => e.type === 'AttackRolled' && (e as { isOpportunityAttack?: boolean }).isOpportunityAttack === true,
      );
      expect(oas.length, `seed=${seed} resolved no opportunity attack`).toBeGreaterThan(0);
    }
  });

  it('default movement:"none" emits none of the tactical events', () => {
    for (const seed of SEEDS) {
      const t = types(runBattle({ seed, pack: STARTER, teamSize: 2 }));
      expect(t).not.toContain('CombatantMoved');
      expect(t).not.toContain('LocationCreated');
      expect(t).not.toContain('CharacterLocationChanged');
    }
  });
});
