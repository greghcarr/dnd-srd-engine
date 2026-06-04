// Slice 481: Pirate Multiattack (two Daggers).
//
// RAW (SRD 5.2.1 Pirate, CR 1): "Multiattack. The pirate makes two
// Dagger attacks. It can replace one attack with a use of Enthralling
// Panache." The pack ships a generic `dagger` already, so the
// slice is statblock-only - no new weapon needed.
//
// The "replace with Enthralling Panache" arm is the slice-464
// open-follow-up Dragon-style alternate-shape; deferred. Enthralling
// Panache itself (WIS save vs DC 12, Charmed on fail) needs a stand-
// alone forced-save planner and stays deferred.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { runtimeMultiattackFromStatblock } from '../../../src/derive/multiattack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

describe('Pirate Multiattack (slice 481)', () => {
  it('Pirate statblock declares Multiattack: two Daggers (existing pack item)', () => {
    const pirate = PACK.monsters.find((m) => m.id === 'pirate');
    expect(pirate?.multiattack).toEqual({
      name: 'Pirate Multiattack',
      attacks: [{ weaponId: 'dagger', count: 2 }],
    });
  });

  it('engine.plan.multiattack on a Pirate emits 2 AttackRolled events', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const statblock = PACK.monsters.find((m) => m.id === 'pirate')!;
    const dagger = makeItemInstance('dagger');
    const pattern = runtimeMultiattackFromStatblock(statblock.multiattack!, {
      dagger: dagger.id,
    });
    const pirate: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Pirate',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'pirate',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 8, WIS: 12, CHA: 14 },
      hp: { current: 33, max: 33, temp: 0 },
      multiattack: pattern,
    });
    const target: Character = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Hero',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 60, max: 60, temp: 0 },
    });
    let campaign: Campaign = engine.createCampaign({ name: 'pirate-multi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pirate } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: pirate.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
  });
});
