// Slice 694: tactical battle setup emission, extracted from runBattle so
// the 1,000-line script only wires it.
//
// There is no engine plan.* API for LocationCreated / CharacterLocation
// Changed (they are pure record events), so they are constructed directly
// and committed — exactly as the fuzz already does for ItemAcquired /
// CharacterCreated. Order is mandatory: LocationCreated, then one
// CharacterLocationChanged per combatant (so the positioned createEncounter
// and plan.move can resolve the map via state.characterLocations), and
// only then does the caller create the positioned encounter.

import { commit, type Campaign } from '../../src/engine/commit.js';
import { newEventId, newLocationId } from '../../src/ids.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { Position } from '../../src/schemas/runtime/encounter.js';
import { generateArenaMap } from './arena.js';

const ARENA_NAME = 'Tactical arena';

export interface TacticalSetup {
  readonly campaign: Campaign;
  readonly locationId: string;
  readonly placements: ReadonlyArray<{ characterId: string; position: Position }>;
}

export const emitTacticalSetup = (args: {
  readonly campaign: Campaign;
  readonly seed: number;
  readonly teamSize: number;
  readonly teamACharacterIds: ReadonlyArray<string>;
  readonly teamBCharacterIds: ReadonlyArray<string>;
  readonly nextAt: () => string;
}): TacticalSetup => {
  const { map, spawnsA, spawnsB } = generateArenaMap(args.seed, args.teamSize);
  const locationId = newLocationId();
  const allIds = [...args.teamACharacterIds, ...args.teamBCharacterIds];

  const setupEvents: Event[] = [
    {
      id: newEventId(),
      at: args.nextAt(),
      type: 'LocationCreated',
      locationId,
      name: ARENA_NAME,
      map,
    } as Event,
    ...allIds.map(
      (characterId) =>
        ({
          id: newEventId(),
          at: args.nextAt(),
          type: 'CharacterLocationChanged',
          characterId,
          toLocationId: locationId,
        }) as Event,
    ),
  ];
  const campaign = commit(args.campaign, setupEvents);

  // Team A spawns on the left column, team B on the right; one spawn per
  // combatant in team order.
  const placements = [
    ...args.teamACharacterIds.map((characterId, i) => ({ characterId, position: spawnsA[i]! })),
    ...args.teamBCharacterIds.map((characterId, i) => ({ characterId, position: spawnsB[i]! })),
  ];
  return { campaign, locationId, placements };
};
