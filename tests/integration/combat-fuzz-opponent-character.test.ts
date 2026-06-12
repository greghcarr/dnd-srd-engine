// Integration test for the combat-fuzz drop-in OPPONENT character (slice 833)
// — the PvP mirror of the slice-778 player drop-in.
//
// dnd-web's real-vs-real 1v1 calls `runBattle` with BOTH a `playerCharacter`
// (team A[0]) and an `opponentCharacter` (team B[0]) so two saved sheets fight
// verbatim — each its own id, class, level, and gear. Like `playerCharacter`,
// `opponentCharacter` is an INDEPENDENT axis from the seed: B[0]'s shared-cursor
// random build is still drawn-and-discarded, so the rest of team B + other
// combatants + map stay seed-deterministic and built at `opts.level`.
//
// Asserts on the simulator's output SHAPE (ids, class, level, gear, the
// seed-driven build, the arena map), not byte-for-byte transcripts — raw
// instance/event IDs are random ULIDs that drift every run (same convention as
// the slice-778 player-character test).

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

type DropIn = { character: Character; itemInstances: ItemInstance[] };

// A saved player-side sheet: a level-1 fighter, already armed (longsword +
// chain mail). Fresh ULIDs per call so each test gets distinct, collision-free
// ids.
const makePlayerCharacter = (): DropIn => {
  const weapon: ItemInstance = { id: newItemInstanceId(), definitionId: 'longsword', quantity: 1, attuned: false, identifiedByCharacterIds: [] };
  const armor: ItemInstance = { id: newItemInstanceId(), definitionId: 'chain-mail', quantity: 1, attuned: false, identifiedByCharacterIds: [] };
  const character = CharacterSchema.parse({
    id: newCharacterId(), name: 'Saved Hero', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: [weapon.id, armor.id],
    equipped: { mainHand: weapon.id, armor: armor.id, attuned: [] },
    knownSpells: [], preparedSpells: [],
    resources: [{ resourceId: 'second-wind', current: 2, max: 2 }],
    weaponMasteries: ['longsword'],
  });
  return { character, itemInstances: [weapon, armor] };
};

// A saved opponent-side sheet: a DISTINCT class (rogue) + gear (shortsword +
// leather), so B[0] is unambiguously the drop-in, not a seed-built Bran.
const makeOpponentCharacter = (): DropIn => {
  const weapon: ItemInstance = { id: newItemInstanceId(), definitionId: 'shortsword', quantity: 1, attuned: false, identifiedByCharacterIds: [] };
  const armor: ItemInstance = { id: newItemInstanceId(), definitionId: 'leather-armor', quantity: 1, attuned: false, identifiedByCharacterIds: [] };
  const character = CharacterSchema.parse({
    id: newCharacterId(), name: 'Saved Rival', speciesId: 'elf', backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 15, CON: 13, INT: 14, WIS: 12, CHA: 8 },
    hp: { current: 9, max: 9, temp: 0 },
    inventory: [weapon.id, armor.id],
    equipped: { mainHand: weapon.id, armor: armor.id, attuned: [] },
    knownSpells: [], preparedSpells: [],
    resources: [],
  });
  return { character, itemInstances: [weapon, armor] };
};

const seedDrivenB1Build = (r: ReturnType<typeof runBattle>) => {
  const b1 = r.campaign.state.characters[r.teamBCharacterIds[1]!]!;
  return { classId: b1.classes[0]?.classId, level: b1.classes[0]?.level, speciesId: b1.speciesId, backgroundId: b1.backgroundId };
};
const mapOf = (r: ReturnType<typeof runBattle>) =>
  r.locationId !== undefined ? r.campaign.state.locations[r.locationId]?.map : undefined;

describe('combat-fuzz: drop-in opponent character — PvP (slice 833)', () => {
  it('seats BOTH drop-ins verbatim: A[0] = player, B[0] = opponent (own ids/classes/levels/gear)', () => {
    const player = makePlayerCharacter();
    const opponent = makeOpponentCharacter();
    const result = runBattle({
      seed: 433, pack: STARTER, level: 1,
      playerCharacter: { character: player.character, itemInstances: player.itemInstances },
      opponentCharacter: { character: opponent.character, itemInstances: opponent.itemInstances },
    });
    // Team A[0] is the player, team B[0] is the opponent, each by its OWN id.
    expect(result.teamACharacterIds[0]).toBe(player.character.id);
    expect(result.teamBCharacterIds[0]).toBe(opponent.character.id);
    const a0 = result.campaign.state.characters[player.character.id]!;
    const b0 = result.campaign.state.characters[opponent.character.id]!;
    expect(a0.classes[0]?.classId).toBe('fighter');
    expect(a0.classes[0]?.level).toBe(1);
    expect(b0.classes[0]?.classId).toBe('rogue');
    expect(b0.classes[0]?.level).toBe(1);
    // Same gear: each equipped main hand preserved + every supplied instance emitted.
    expect(a0.equipped.mainHand).toBe(player.character.equipped.mainHand);
    expect(b0.equipped.mainHand).toBe(opponent.character.equipped.mainHand);
    for (const inst of [...player.itemInstances, ...opponent.itemInstances]) {
      expect(result.campaign.state.itemInstances[inst.id]?.definitionId).toBe(inst.definitionId);
    }
  });

  it('is deterministic given the seed (same teams, winner, rounds across runs)', () => {
    const player = makePlayerCharacter();
    const opponent = makeOpponentCharacter();
    const opts = {
      seed: 434, pack: STARTER, level: 1,
      playerCharacter: { character: player.character, itemInstances: player.itemInstances },
      opponentCharacter: { character: opponent.character, itemInstances: opponent.itemInstances },
    } as const;
    const a = runBattle(opts);
    const b = runBattle(opts);
    expect(a.teamACharacterIds).toEqual(b.teamACharacterIds);
    expect(a.teamBCharacterIds).toEqual(b.teamBCharacterIds);
    expect(a.winner).toBe(b.winner);
    expect(a.rounds).toBe(b.rounds);
  });

  it('does not perturb the seed stream: the seed-driven B[1] + map stay identical with/without it', () => {
    const player = makePlayerCharacter();
    const opponent = makeOpponentCharacter();
    const base = runBattle({
      seed: 435, pack: STARTER, level: 1, teamSize: 2, movement: 'tactical',
      playerCharacter: { character: player.character, itemInstances: player.itemInstances },
    });
    const withOpp = runBattle({
      seed: 435, pack: STARTER, level: 1, teamSize: 2, movement: 'tactical',
      playerCharacter: { character: player.character, itemInstances: player.itemInstances },
      opponentCharacter: { character: opponent.character, itemInstances: opponent.itemInstances },
    });
    // B[0] swapped for the drop-in; B[1] (still seed-built) and the arena map
    // are byte-identical — the opponent axis draws-and-discards B[0]'s build.
    expect(withOpp.teamBCharacterIds[0]).toBe(opponent.character.id);
    expect(seedDrivenB1Build(withOpp)).toEqual(seedDrivenB1Build(base));
    expect(mapOf(withOpp)).toBeDefined();
    expect(mapOf(withOpp)).toEqual(mapOf(base));
    // A[0] is unaffected by the opponent axis.
    expect(withOpp.teamACharacterIds[0]).toBe(player.character.id);
  });

  it('B[0] keeps its own level (never re-leveled); other combatants are built at opts.level', () => {
    const opponent = makeOpponentCharacter(); // a level-1 rogue
    const result = runBattle({
      seed: 436, pack: STARTER, level: 5, teamSize: 2,
      opponentCharacter: { character: opponent.character, itemInstances: opponent.itemInstances },
    });
    const b0 = result.campaign.state.characters[opponent.character.id]!;
    expect(b0.classes[0]?.level).toBe(1); // verbatim, not leveled to 5
    // The seed-built B[1] is sized at opts.level (independent axis).
    expect(seedDrivenB1Build(result).level).toBe(5);
  });

  it('is ignored for vs=monster (team B[0] is a Beast, not the drop-in)', () => {
    const opponent = makeOpponentCharacter();
    const result = runBattle({
      seed: 437, pack: STARTER, level: 1, vs: 'monster',
      opponentCharacter: { character: opponent.character, itemInstances: opponent.itemInstances },
    });
    expect(result.teamBCharacterIds[0]).not.toBe(opponent.character.id);
    // The opponent character snapshot was never seated into state.
    expect(result.campaign.state.characters[opponent.character.id]).toBeUndefined();
    const b0 = result.campaign.state.characters[result.teamBCharacterIds[0]!]!;
    expect(b0.statblockId).toBeDefined(); // a monster
  });
});
