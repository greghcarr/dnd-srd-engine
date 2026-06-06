// Slice 693: byte-identity guard for the movement-mode seam.
//
// The tactical movement mode (slices 693-695) adds a move-policy seam to
// runBattle. The default — movement:'none' — must keep the event log
// byte-identical to the pre-seam positionless path. The fuzz-matrix +
// replay-equivalence suites prove the cross-cutting invariants; this test
// pins the specific guarantee dnd-web depends on: the default path emits
// NO movement/location events and creates the encounter positionless.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';
import { normalizeEvents } from '../fixtures/index.js';

const STARTER = loadStarterPack();
const SEEDS = [1, 2, 3, 7, 42];

describe('combat-fuzz default movement guard (slice 693)', () => {
  it('default runBattle reports movement:"none" and no locationId', () => {
    const result = runBattle({ seed: 1, pack: STARTER });
    expect(result.movement).toBe('none');
    expect(result.locationId).toBeUndefined();
  });

  it('default path emits no CombatantMoved / LocationCreated / CharacterLocationChanged, and no positioned EncounterCreated', () => {
    for (const seed of SEEDS) {
      const { campaign } = runBattle({ seed, pack: STARTER });
      const types = campaign.events.map((e) => e.type);
      expect(types, `seed=${seed} CombatantMoved`).not.toContain('CombatantMoved');
      expect(types, `seed=${seed} LocationCreated`).not.toContain('LocationCreated');
      expect(types, `seed=${seed} CharacterLocationChanged`).not.toContain('CharacterLocationChanged');
      // Encounter is created via the legacy combatantIds path: the
      // positioned form carries a `combatants` array instead.
      const encCreated = campaign.events.filter((e) => e.type === 'EncounterCreated');
      expect(encCreated.length, `seed=${seed} has an encounter`).toBeGreaterThan(0);
      for (const e of encCreated) {
        expect(
          (e as { combatants?: unknown }).combatants,
          `seed=${seed} EncounterCreated should be positionless`,
        ).toBeUndefined();
      }
    }
  });

  it('explicit movement:"none" matches the default (normalized: identical rolls, shape, order)', () => {
    // Entity ids (ulid) and wall-clock `at` stamps are fresh per run, so
    // raw JSON differs; normalize them out. What remains — event types,
    // order, and every RNG-driven value — must match, proving
    // movement:'none' is the same code path as omitting the option.
    for (const seed of SEEDS) {
      const def = runBattle({ seed, pack: STARTER });
      const explicit = runBattle({ seed, pack: STARTER, movement: 'none' });
      expect(normalizeEvents(explicit.campaign.events)).toEqual(
        normalizeEvents(def.campaign.events),
      );
    }
  });
});
