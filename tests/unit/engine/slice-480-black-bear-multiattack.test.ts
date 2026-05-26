// Slice 480: Black Bear Multiattack (two Rends).
//
// RAW (SRD 5.2.1 Black Bear, CR 1/2): "Multiattack. The bear makes
// two Rend attacks. Rend: 1d6 slashing." Same shape as Hippogriff
// Multiattack (slice 478) - single natural weapon, count 2.

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

describe('Black Bear Multiattack (slice 480)', () => {
  it('black-bear-rend is a 1d6 slashing natural weapon with no rider', () => {
    const rend = PACK.items.find((i) => i.id === 'black-bear-rend');
    expect(rend).toBeDefined();
    expect(rend && rend.itemKind === 'weapon' ? rend.damageDice : undefined).toBe('1d6');
    expect(rend && rend.itemKind === 'weapon' ? rend.damageType : undefined).toBe('slashing');
    expect(rend && rend.itemKind === 'weapon' ? rend.onHit : undefined).toBeUndefined();
  });

  it('Black Bear statblock declares Multiattack: two Rends', () => {
    const bear = PACK.monsters.find((m) => m.id === 'black-bear');
    expect(bear?.multiattack).toEqual({
      name: 'Black Bear Multiattack',
      attacks: [{ weaponId: 'black-bear-rend', count: 2 }],
    });
  });

  it('engine.plan.multiattack on a Black Bear emits 2 AttackRolled events', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const statblock = PACK.monsters.find((m) => m.id === 'black-bear')!;
    const rend = makeItemInstance('black-bear-rend');
    const pattern = runtimeMultiattackFromStatblock(statblock.multiattack!, {
      'black-bear-rend': rend.id,
    });
    const bear: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Black Bear',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'black-bear',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 15, DEX: 12, CON: 14, INT: 2, WIS: 12, CHA: 7 },
      hp: { current: 19, max: 19, temp: 0 },
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
    let campaign: Campaign = engine.createCampaign({ name: 'black-bear-multi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: rend },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bear } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: bear.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
  });
});
