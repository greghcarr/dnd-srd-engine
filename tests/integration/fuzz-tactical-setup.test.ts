// Slice 694: end-to-end wiring of the tactical setup into runBattle.
// Movement itself lands in slice 695; here we only assert that tactical
// mode spreads combatants on a generated arena (location + per-combatant
// placement + positioned encounter) and stays seed-deterministic.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';
import { normalizeEvents } from '../fixtures/index.js';
import { replay } from '../../src/engine/replay.js';

const STARTER = loadStarterPack();

describe('combat-fuzz tactical setup (slice 694)', () => {
  it('1v1 tactical: location, 2 CharacterLocationChanged, positioned encounter, map in state', () => {
    const result = runBattle({ seed: 1, pack: STARTER, movement: 'tactical' });
    expect(result.movement).toBe('tactical');
    expect(result.locationId).toBeDefined();

    const types = result.campaign.events.map((e) => e.type);
    expect(types).toContain('LocationCreated');
    expect(
      result.campaign.events.filter((e) => e.type === 'CharacterLocationChanged'),
    ).toHaveLength(2);

    const encCreated = result.campaign.events.find((e) => e.type === 'EncounterCreated')!;
    expect((encCreated as { combatants?: unknown }).combatants).toBeDefined();

    const loc = result.campaign.state.locations[result.locationId!];
    expect(loc?.map?.widthCells).toBe(16);

    const enc = Object.values(result.campaign.state.encounters)[0]!;
    for (const c of enc.combatants) expect(c.position).toBeDefined();
  });

  it('2v2 tactical: 4 CharacterLocationChanged + 4 positioned combatants', () => {
    const result = runBattle({ seed: 2, pack: STARTER, teamSize: 2, movement: 'tactical' });
    expect(
      result.campaign.events.filter((e) => e.type === 'CharacterLocationChanged'),
    ).toHaveLength(4);
    const enc = Object.values(result.campaign.state.encounters)[0]!;
    expect(enc.combatants).toHaveLength(4);
    for (const c of enc.combatants) expect(c.position).toBeDefined();
  });

  it('tactical battles are seed-deterministic (normalized)', () => {
    const a = runBattle({ seed: 5, pack: STARTER, movement: 'tactical' });
    const b = runBattle({ seed: 5, pack: STARTER, movement: 'tactical' });
    expect(normalizeEvents(a.campaign.events)).toEqual(normalizeEvents(b.campaign.events));
  });

  it('tactical event log replays to the same state (location + positioned events)', () => {
    for (const seed of [1, 3, 7]) {
      const result = runBattle({ seed, pack: STARTER, movement: 'tactical' });
      expect(JSON.stringify(replay(result.campaign.events))).toBe(
        JSON.stringify(result.campaign.state),
      );
    }
  });
});
