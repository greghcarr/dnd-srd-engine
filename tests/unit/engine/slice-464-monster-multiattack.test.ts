// Slice 464: monster-side Multiattack declaration on the statblock,
// plus a derive helper that bridges from a statblock's declared
// pattern (definition-keyed) to the runtime Character.multiattack
// pattern (instance-keyed) that planMultiattack consumes.
//
// RAW (SRD 5.2.1 Ghoul): "Multiattack. The ghoul makes two Bite
// attacks." The Ghoul statblock now carries `multiattack: { name,
// attacks: [{ weaponId: 'ghoul-bite', count: 2 }] }`. Consumers mint
// a ghoul-bite item instance, call runtimeMultiattackFromStatblock,
// drop the result into the Character, then call engine.plan.multiattack
// to get two AttackRolled events.
//
// Slice 462 wired the ghoul-bite natural weapon (piercing + necrotic
// onHit rider). This slice ships the action that pairs it with the
// "make two Bite attacks" pattern from the statblock.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import { runtimeMultiattackFromStatblock } from '../../../src/derive/multiattack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

describe('Monster Multiattack (slice 464)', () => {
  it('Ghoul statblock declares Multiattack: two Bite attacks', () => {
    const ghoul = PACK.monsters.find((m) => m.id === 'ghoul');
    expect(ghoul).toBeDefined();
    expect(ghoul!.multiattack).toEqual({
      name: 'Ghoul Multiattack',
      attacks: [{ weaponId: 'ghoul-bite', count: 2 }],
    });
  });

  it('runtimeMultiattackFromStatblock maps weaponId to weaponInstanceId', () => {
    const ghoul = PACK.monsters.find((m) => m.id === 'ghoul')!;
    const bite = makeItemInstance('ghoul-bite');
    const pattern = runtimeMultiattackFromStatblock(ghoul.multiattack!, {
      'ghoul-bite': bite.id,
    });
    expect(pattern.name).toBe('Ghoul Multiattack');
    expect(pattern.attacks).toEqual([{ weaponInstanceId: bite.id, count: 2 }]);
  });

  it('throws when a referenced weaponId has no instance in the map', () => {
    const ghoul = PACK.monsters.find((m) => m.id === 'ghoul')!;
    expect(() => runtimeMultiattackFromStatblock(ghoul.multiattack!, {})).toThrow(
      /No item instance provided for weapon 'ghoul-bite'/,
    );
  });

  it('engine.plan.multiattack on a Ghoul emits two AttackRolled events', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const ghoulStatblock = PACK.monsters.find((m) => m.id === 'ghoul')!;
    const bite = makeItemInstance('ghoul-bite');
    const pattern = runtimeMultiattackFromStatblock(ghoulStatblock.multiattack!, {
      'ghoul-bite': bite.id,
    });
    const ghoul: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Ghoul',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'ghoul',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 13, DEX: 15, CON: 10, INT: 7, WIS: 10, CHA: 6 },
      hp: { current: 22, max: 22, temp: 0 },
      multiattack: pattern,
    });
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'ghoul-multi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ghoul } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: ghoul.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
  });
});
