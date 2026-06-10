// Integration test for the combat-fuzz drop-in player character (slice 778).
//
// dnd-web's interactive duel calls `runBattle` to generate the positioned
// 1v1 set-up, then branches the campaign and drives it live. This slice
// lets the consumer drop a SAVED character (a dndbnb sheet) into team A[0]
// verbatim — its own id, class, level, and gear — instead of the seed's
// random buildL1 + levelUpTo roll. Like `playerClass` it's an INDEPENDENT
// axis from the seed: the opponent + other combatants + map stay
// seed-deterministic and are built at `opts.level`, so the rest of the
// battle is byte-identical to a normal battle at that level.
//
// Asserts on the simulator's output SHAPE (ids, class, level, gear, the
// opponent's build, the arena map), not byte-for-byte transcripts — raw
// instance/event IDs are random ULIDs that drift every run (see the
// slice-717 flag-matrix test for the same convention).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';
import {
  CharacterSchema,
  newCharacterId,
  newItemInstanceId,
  type Character,
} from '../../src/index.js';
import type { ItemInstance } from '../../src/schemas/runtime/item-instance.js';

const STARTER = loadStarterPack();

// A saved dndbnb-style character: a level-1 fighter, already armed with a
// longsword + chain mail (the "it's already armed; no auto-equip" contract).
// Returns the character snapshot + its item instances exactly as a consumer
// hands them to runBattle. Fresh ULIDs per call so each test gets a distinct
// character with no id collisions across the suite.
const makePlayerCharacter = (): {
  character: Character;
  itemInstances: ItemInstance[];
} => {
  const weapon: ItemInstance = {
    id: newItemInstanceId(),
    definitionId: 'longsword',
    quantity: 1,
    attuned: false,
    identifiedByCharacterIds: [],
  };
  const armor: ItemInstance = {
    id: newItemInstanceId(),
    definitionId: 'chain-mail',
    quantity: 1,
    attuned: false,
    identifiedByCharacterIds: [],
  };
  const character = CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Saved Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: [weapon.id, armor.id],
    equipped: { mainHand: weapon.id, armor: armor.id, attuned: [] },
    knownSpells: [],
    preparedSpells: [],
    resources: [{ resourceId: 'second-wind', current: 2, max: 2 }],
    weaponMasteries: ['longsword'],
  });
  return { character, itemInstances: [weapon, armor] };
};

const opponentBuild = (r: ReturnType<typeof runBattle>) => {
  const b = r.campaign.state.characters[r.teamBCharacterIds[0]!]!;
  return {
    classId: b.classes[0]?.classId,
    level: b.classes[0]?.level,
    speciesId: b.speciesId,
    backgroundId: b.backgroundId,
  };
};

describe('combat-fuzz: drop-in player character (slice 778)', () => {
  it('uses the supplied character verbatim as team A[0] (same id/class/level/gear)', () => {
    const { character, itemInstances } = makePlayerCharacter();
    const result = runBattle({
      seed: 311,
      pack: STARTER,
      level: 1,
      playerCharacter: { character, itemInstances },
    });
    // A[0] is the supplied character, addressed by its OWN id.
    expect(result.teamACharacterIds[0]).toBe(character.id);
    const a0 = result.campaign.state.characters[character.id];
    expect(a0).toBeDefined();
    expect(a0!.classes[0]?.classId).toBe('fighter');
    expect(a0!.classes[0]?.level).toBe(1);
    // Same gear: the equipped main hand is preserved and every supplied
    // item instance was emitted (ItemAcquired) into state.
    expect(a0!.equipped.mainHand).toBe(character.equipped.mainHand);
    for (const inst of itemInstances) {
      expect(result.campaign.state.itemInstances[inst.id]?.definitionId).toBe(inst.definitionId);
    }
  });

  it('opponent + map stay byte-identical to a normal battle at opts.level', () => {
    const { character, itemInstances } = makePlayerCharacter();
    const base = runBattle({ seed: 312, pack: STARTER, level: 1, movement: 'tactical' });
    const withPC = runBattle({
      seed: 312,
      pack: STARTER,
      level: 1,
      movement: 'tactical',
      playerCharacter: { character, itemInstances },
    });
    // The seed-driven opponent is identical: the drop-in consumes no shared
    // draws (A[0]'s random build is still drawn-and-discarded to keep the
    // stream aligned), so team B builds from the same cursor positions.
    expect(opponentBuild(withPC)).toEqual(opponentBuild(base));
    // The tactical arena is seed-derived, so the map is the same too.
    const mapOf = (r: ReturnType<typeof runBattle>) =>
      r.locationId !== undefined ? r.campaign.state.locations[r.locationId]?.map : undefined;
    expect(mapOf(withPC)).toBeDefined();
    expect(mapOf(withPC)).toEqual(mapOf(base));
    // And A[0] really was swapped for the supplied character.
    expect(withPC.teamACharacterIds[0]).toBe(character.id);
  });

  it('A[0] is verbatim (never re-leveled); opponent is built at opts.level', () => {
    const { character, itemInstances } = makePlayerCharacter(); // a level-1 fighter
    const result = runBattle({
      seed: 313,
      pack: STARTER,
      level: 5,
      playerCharacter: { character, itemInstances },
    });
    const a0 = result.campaign.state.characters[character.id]!;
    // The drop-in stays at its OWN level — buildL1 + levelUpTo are bypassed
    // for A[0] even though opts.level is 5.
    expect(a0.classes[0]?.level).toBe(1);
    // The opponent is sized at opts.level, an axis independent of the
    // player's level (the caller normally passes level = the PC's level).
    expect(opponentBuild(result).level).toBe(5);
  });

  it('playerCharacter wins over playerClass for A[0]', () => {
    const { character, itemInstances } = makePlayerCharacter(); // a fighter
    const result = runBattle({
      seed: 314,
      pack: STARTER,
      level: 1,
      playerClass: 'wizard', // ignored for A[0] when a character is supplied
      playerCharacter: { character, itemInstances },
    });
    expect(result.teamACharacterIds[0]).toBe(character.id);
    expect(result.campaign.state.characters[character.id]!.classes[0]?.classId).toBe('fighter');
  });
});
