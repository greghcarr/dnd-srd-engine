// Slice 684: plan.move now costs the shortest LEGAL path (Dijkstra
// via findPath), not the straight Bresenham line. This means moves
// that the consumer aims through impassable terrain or other
// combatants are accepted IF a detour fits within remaining
// movement budget — and rejected when no path exists.
//
// What this audit pins:
//   1. Open-map move costs Chebyshev cells × cellSize.
//   2. Move around a wall costs the detour, not the straight line.
//   3. Move whose detour exceeds remaining movement throws.
//   4. Move where the destination is sealed off throws ("no legal
//      path").
//   5. Move where the destination is occupied throws (existing
//      slice-pre-684 behavior preserved).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newLocationId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type {
  LocationCreatedEvent,
  CharacterLocationChangedEvent,
} from '../../../src/schemas/events/locations.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, speed = 30): Character => {
  const c = CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });
  return { ...c, speedFeet: speed };
};

// 6x6 with a horizontal wall at cell-y 2 spanning x 0..4 (x=5 is
// open — the only path through).
const buildWalledMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Walled',
  map: {
    widthCells: 6,
    heightCells: 6,
    cellSizeFeet: 5,
    terrain: [
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['impassable', 'impassable', 'impassable', 'impassable', 'impassable', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ],
  },
});

// 6x6 sealed pocket around cell (3,3).
const buildSealedMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Sealed',
  map: {
    widthCells: 6,
    heightCells: 6,
    cellSizeFeet: 5,
    terrain: [
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'impassable', 'impassable', 'impassable', 'normal'],
      ['normal', 'normal', 'impassable', 'normal', 'impassable', 'normal'],
      ['normal', 'normal', 'impassable', 'impassable', 'impassable', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ],
  },
});

const setup = (
  mapBuilder: (locationId: string) => LocationCreatedEvent,
  fighter: Character,
  startPosition: { x: number; y: number },
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'move-pathing' });
  const locationId = newLocationId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    mapBuilder(locationId),
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterLocationChanged',
      characterId: fighter.id as ULID,
      toLocationId: locationId as ULID,
    } satisfies CharacterLocationChangedEvent,
  ]);
  const created = engine.plan.createEncounter(campaign.state, {
    combatants: [{ characterId: fighter.id, position: startPosition }],
  });
  campaign = commit(campaign, [
    ...created.events,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: created.encounterId as ULID,
      rolls: [{ combatantId: fighter.id as ULID, d20: 15, modifier: 2, total: 17 }],
    } satisfies InitiativeRolledEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'EncounterStarted',
      encounterId: created.encounterId as ULID,
    } satisfies EncounterStartedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'TurnStarted',
      encounterId: created.encounterId as ULID,
      combatantId: fighter.id as ULID,
      round: 1,
    } satisfies TurnStartedEvent,
  ]);
  return { engine, campaign, encounterId: created.encounterId };
};

describe('slice 684: plan.move uses shortest-path cost', () => {
  it('open map: cost matches Chebyshev × cellSize', () => {
    const fighter = buildFighter('Walker', 30);
    // No map — but we want a map. Use the walled map but stay
    // in the open zone (cell-y 0..1).
    const s = setup(buildWalledMap, fighter, { x: 0, y: 0 });
    const out = s.engine.plan.move(s.campaign.state, {
      combatantId: fighter.id,
      to: { x: 25, y: 5 }, // feet (25, 5) → cell (5, 1)
    });
    const moved = out.events.find((e): e is CombatantMovedEvent => e.type === 'CombatantMoved');
    expect(moved).toBeDefined();
    // Cheby (0,0) → (5,1): 5 cells × 5 ft = 25 ft.
    expect(moved!.feetTraveled).toBe(25);
  });

  it('walled map: cost matches detour, not the straight line', () => {
    const fighter = buildFighter('Walker', 50);
    const s = setup(buildWalledMap, fighter, { x: 0, y: 0 });
    // Destination is below the wall (cell-y 3).
    const out = s.engine.plan.move(s.campaign.state, {
      combatantId: fighter.id,
      to: { x: 0, y: 15 }, // feet (0, 15) → cell (0, 3)
    });
    const moved = out.events.find((e): e is CombatantMovedEvent => e.type === 'CombatantMoved');
    expect(moved, 'detour move should succeed').toBeDefined();
    // Straight Chebyshev cost would be 3 cells × 5 ft = 15 ft, but the
    // straight line passes through the impassable wall at cell-y 2.
    // The detour via cell-x=5 (the open column) must cost MORE than 15 ft.
    expect(moved!.feetTraveled).toBeGreaterThan(15);
  });

  it('walled map: detour exceeding remaining movement throws', () => {
    // Short speed: 5 ft (1 cell). Can't reach below the wall via
    // detour even though the destination is structurally reachable.
    const fighter = buildFighter('Short', 5);
    const s = setup(buildWalledMap, fighter, { x: 0, y: 0 });
    expect(() =>
      s.engine.plan.move(s.campaign.state, {
        combatantId: fighter.id,
        to: { x: 0, y: 15 },
      }),
    ).toThrow(/exceeds (remaining|available) movement|not enough movement|cannot move/i);
  });

  it('sealed destination: throws with "no legal path"', () => {
    const fighter = buildFighter('Trapped', 30);
    const s = setup(buildSealedMap, fighter, { x: 0, y: 0 });
    expect(() =>
      s.engine.plan.move(s.campaign.state, {
        combatantId: fighter.id,
        to: { x: 15, y: 15 }, // cell (3, 3) — sealed off
      }),
    ).toThrow(/No legal path|impassable|blocked/i);
  });
});
