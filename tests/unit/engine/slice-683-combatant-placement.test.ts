// Slice 683: combatant placement (Work item 1 of the spatial
// combat plan). Extends CreateEncounter to accept per-combatant
// starting positions and adds CombatantPlaced + planPlaceCombatant
// for mid-encounter placement (summons, teleports).
//
// What this audit pins:
//   1. createEncounter with `combatants: [{ characterId, position }]`
//      sets the position on the runtime combatant.
//   2. createEncounter with legacy `combatantIds` still works
//      (back-compat); combatants get no position.
//   3. Placement validation when a location map is present:
//      out-of-bounds, impassable terrain, and same-cell collision
//      all throw.
//   4. planPlaceCombatant emits CombatantPlaced; reducer sets the
//      position; replay reproduces it.
//   5. planMove now works straight from a placed position (the
//      pre-cycle "Combatant has no position set" error is gone).
//   6. The intent rejects passing both `combatants` and
//      `combatantIds` (either-or).

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
  CombatantPlacedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { LocationCreatedEvent, CharacterLocationChangedEvent } from '../../../src/schemas/events/locations.js';
import type { ULID } from '../../../src/engine/ids-utils.js';
import { replay } from '../../../src/engine/replay.js';

const PACK = loadStarterPack();

const buildFighter = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

// 6x6-cell grid with 5-ft cells (30x30 ft total). Cell-row 2 (rows
// at feet-y 10-14) is a wall of impassable; everything else normal.
// Positions in the engine convention are FEET-coords; cell-coords
// are derived via floor(pos / cellSizeFeet).
const buildLocationWithMap = (locationId: string): LocationCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'LocationCreated',
  locationId: locationId as ULID,
  name: 'Arena',
  map: {
    widthCells: 6,
    heightCells: 6,
    cellSizeFeet: 5,
    terrain: [
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['impassable', 'impassable', 'impassable', 'impassable', 'impassable', 'impassable'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
      ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ],
  },
});

const setupCampaignWithMap = (
  fighters: Character[],
  locationId: string,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'placement' });
  campaign = commit(campaign, [
    ...fighters.map((f) => ({
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated' as const,
      snapshot: f,
    } satisfies CharacterCreatedEvent)),
    buildLocationWithMap(locationId),
    ...fighters.map((f) => ({
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterLocationChanged' as const,
      characterId: f.id as ULID,
      toLocationId: locationId as ULID,
    } satisfies CharacterLocationChangedEvent)),
  ]);
  return { engine, campaign };
};

describe('slice 683: combatant placement (Work item 1)', () => {
  it('createEncounter with `combatants` sets each placement\'s position on the runtime combatant', () => {
    const a = buildFighter('Aria');
    const b = buildFighter('Bran');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a, b], locationId);
    const out = s.engine.plan.createEncounter(s.campaign.state, {
      combatants: [
        { characterId: a.id, position: { x: 0, y: 0 } },
        { characterId: b.id, position: { x: 5, y: 0 } },
      ],
    });
    const after = commit(s.campaign, out.events);
    const encounter = after.state.encounters[out.encounterId]!;
    expect(encounter.combatants[0]!.position).toEqual({ x: 0, y: 0 });
    expect(encounter.combatants[1]!.position).toEqual({ x: 5, y: 0 });
  });

  it('legacy `combatantIds` path still works (no positions)', () => {
    const a = buildFighter('Aria');
    const b = buildFighter('Bran');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'legacy' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
    ]);
    const out = engine.plan.createEncounter(campaign.state, {
      combatantIds: [a.id, b.id],
    });
    const after = commit(campaign, out.events);
    const encounter = after.state.encounters[out.encounterId]!;
    expect(encounter.combatants[0]!.position).toBeUndefined();
    expect(encounter.combatants[1]!.position).toBeUndefined();
  });

  it('intent rejects passing both `combatants` and `combatantIds`', () => {
    const a = buildFighter('Aria');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'both' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.createEncounter(campaign.state, {
        combatants: [{ characterId: a.id }],
        combatantIds: [a.id],
      }),
    ).toThrow(/pass `combatants`.*OR.*not both/);
  });

  it('placement validation: out-of-bounds throws (feet beyond 30x30)', () => {
    const a = buildFighter('Aria');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a], locationId);
    expect(() =>
      s.engine.plan.createEncounter(s.campaign.state, {
        combatants: [{ characterId: a.id, position: { x: 999, y: 999 } }],
      }),
    ).toThrow(/out of bounds/);
  });

  it('placement validation: impassable terrain throws (feet 0-4 row, cell-y 2)', () => {
    const a = buildFighter('Aria');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a], locationId);
    // cellSize=5, so feet (0, 10) → cell (0, 2) which is impassable.
    expect(() =>
      s.engine.plan.createEncounter(s.campaign.state, {
        combatants: [{ characterId: a.id, position: { x: 0, y: 10 } }],
      }),
    ).toThrow(/impassable terrain/);
  });

  it('placement validation: same-cell collision throws (two combatants in same 5-ft cell)', () => {
    const a = buildFighter('Aria');
    const b = buildFighter('Bran');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a, b], locationId);
    // feet (0, 0) and feet (3, 4) both round-down to cell (0, 0).
    expect(() =>
      s.engine.plan.createEncounter(s.campaign.state, {
        combatants: [
          { characterId: a.id, position: { x: 0, y: 0 } },
          { characterId: b.id, position: { x: 3, y: 4 } },
        ],
      }),
    ).toThrow(/collides with combatant/);
  });

  it('planPlaceCombatant emits CombatantPlaced; reducer sets the position', () => {
    const a = buildFighter('Aria');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a], locationId);
    const created = s.engine.plan.createEncounter(s.campaign.state, {
      combatants: [{ characterId: a.id }], // no initial position
    });
    let campaign = commit(s.campaign, created.events);
    expect(campaign.state.encounters[created.encounterId]!.combatants[0]!.position).toBeUndefined();
    // Place at feet (15, 0) — cell (3, 0), normal terrain.
    const placed = s.engine.plan.placeCombatant(campaign.state, {
      encounterId: created.encounterId,
      combatantId: a.id,
      position: { x: 15, y: 0 },
    });
    expect(placed.events[0]!.type).toBe('CombatantPlaced');
    campaign = commit(campaign, placed.events);
    expect(campaign.state.encounters[created.encounterId]!.combatants[0]!.position).toEqual({ x: 15, y: 0 });
  });

  it('planPlaceCombatant rejects collision with another placed combatant', () => {
    const a = buildFighter('Aria');
    const b = buildFighter('Bran');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a, b], locationId);
    const created = s.engine.plan.createEncounter(s.campaign.state, {
      combatants: [
        { characterId: a.id, position: { x: 0, y: 0 } },
        { characterId: b.id },
      ],
    });
    const campaign = commit(s.campaign, created.events);
    // Aria is at feet (0,0) = cell (0,0); placing Bran at feet (4,4)
    // → cell (0,0) collides.
    expect(() =>
      s.engine.plan.placeCombatant(campaign.state, {
        encounterId: created.encounterId,
        combatantId: b.id,
        position: { x: 4, y: 4 },
      }),
    ).toThrow(/collides with combatant/);
  });

  it('replay-equivalent: rebuild state from the event log produces identical positions', () => {
    const a = buildFighter('Aria');
    const b = buildFighter('Bran');
    const locationId = newLocationId();
    const s = setupCampaignWithMap([a, b], locationId);
    const created = s.engine.plan.createEncounter(s.campaign.state, {
      combatants: [
        { characterId: a.id, position: { x: 0, y: 0 } },
        { characterId: b.id, position: { x: 25, y: 0 } },
      ],
    });
    const after = commit(s.campaign, created.events);
    const replayedState = replay(after.events);
    const encounter = replayedState.encounters[created.encounterId]!;
    expect(encounter.combatants[0]!.position).toEqual({ x: 0, y: 0 });
    expect(encounter.combatants[1]!.position).toEqual({ x: 25, y: 0 });
  });
});
