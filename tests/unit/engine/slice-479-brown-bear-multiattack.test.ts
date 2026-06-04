// Slice 479: Brown Bear Multiattack (one Bite + one Claw).
//
// RAW (SRD 5.2.1 Brown Bear, CR 1):
// - "Multiattack. The bear makes one Bite attack and one Claw attack."
// - "Bite. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3)
//   Piercing damage."
// - "Claw. Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3)
//   Slashing damage. If the target is a Large or smaller creature,
//   it has the Prone condition."
//
// brown-bear-claw was wired in slice 454. This slice adds the
// brown-bear-bite natural weapon + the Multiattack declaration.

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

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 80, max: 80, temp: 0 },
  });

describe('Brown Bear Multiattack (slice 479)', () => {
  it('brown-bear-bite exists as a 1d8 piercing natural weapon with no rider', () => {
    const bite = PACK.items.find((i) => i.id === 'brown-bear-bite');
    expect(bite).toBeDefined();
    expect(bite && bite.itemKind === 'weapon' ? bite.damageDice : undefined).toBe('1d8');
    expect(bite && bite.itemKind === 'weapon' ? bite.damageType : undefined).toBe('piercing');
    expect(bite && bite.itemKind === 'weapon' ? bite.onHit : undefined).toBeUndefined();
  });

  it('Brown Bear statblock declares Multiattack: one Bite + one Claw', () => {
    const bear = PACK.monsters.find((m) => m.id === 'brown-bear');
    expect(bear?.multiattack).toEqual({
      name: 'Brown Bear Multiattack',
      attacks: [
        { weaponId: 'brown-bear-bite', count: 1 },
        { weaponId: 'brown-bear-claw', count: 1 },
      ],
    });
  });

  it('engine.plan.multiattack on a Brown Bear emits 2 AttackRolled events (one per weapon)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const statblock = PACK.monsters.find((m) => m.id === 'brown-bear')!;
    const bite = makeItemInstance('brown-bear-bite');
    const claw = makeItemInstance('brown-bear-claw');
    const pattern = runtimeMultiattackFromStatblock(statblock.multiattack!, {
      'brown-bear-bite': bite.id,
      'brown-bear-claw': claw.id,
    });
    const bear: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Brown Bear',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'brown-bear',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 17, DEX: 12, CON: 15, INT: 2, WIS: 13, CHA: 7 },
      hp: { current: 22, max: 22, temp: 0 },
      multiattack: pattern,
    });
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'brown-bear-multi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: claw },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bear } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: bear.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
    const weaponIds = attacks.map((a) => a.weaponInstanceId).sort();
    expect(weaponIds).toEqual([bite.id, claw.id].sort());
  });
});
