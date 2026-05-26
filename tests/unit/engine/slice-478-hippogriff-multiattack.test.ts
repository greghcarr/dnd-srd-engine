// Slice 478: Hippogriff Multiattack - third monster-Multiattack user
// after Ghoul (slice 464) and Scout (slice 472).
//
// RAW (SRD 5.2.1 Hippogriff, CR 1): "Multiattack. The hippogriff
// makes two Rend attacks." Rend: 1d8 slashing.
//
// Pure-content slice. New natural weapon `hippogriff-rend` (1d8
// slashing, no rider) + multiattack declaration on the statblock.
// The Flyby trait (no OA on fly-out-of-reach) needs a new primitive
// and stays deferred.
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

describe('Hippogriff Multiattack (slice 478)', () => {
  it('hippogriff-rend exists as a 1d8 slashing natural weapon with no rider', () => {
    const rend = PACK.items.find((i) => i.id === 'hippogriff-rend');
    expect(rend).toBeDefined();
    expect(rend && rend.itemKind === 'weapon' ? rend.damageDice : undefined).toBe('1d8');
    expect(rend && rend.itemKind === 'weapon' ? rend.damageType : undefined).toBe('slashing');
    expect(rend && rend.itemKind === 'weapon' ? rend.onHit : undefined).toBeUndefined();
  });

  it('Hippogriff statblock declares Multiattack: two Rends', () => {
    const hippo = PACK.monsters.find((m) => m.id === 'hippogriff');
    expect(hippo?.multiattack).toEqual({
      name: 'Hippogriff Multiattack',
      attacks: [{ weaponId: 'hippogriff-rend', count: 2 }],
    });
  });

  it('engine.plan.multiattack on a Hippogriff emits exactly 2 AttackRolled events', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const hippoStatblock = PACK.monsters.find((m) => m.id === 'hippogriff')!;
    const rend = makeItemInstance('hippogriff-rend');
    const pattern = runtimeMultiattackFromStatblock(hippoStatblock.multiattack!, {
      'hippogriff-rend': rend.id,
    });
    const hippo: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Hippogriff',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'hippogriff',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 17, DEX: 13, CON: 13, INT: 2, WIS: 12, CHA: 8 },
      hp: { current: 26, max: 26, temp: 0 },
      multiattack: pattern,
    });
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'hippogriff-multi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: rend },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hippo } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: hippo.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
    // Both swings used the same Rend instance (RAW: "two Rend attacks").
    for (const a of attacks) {
      expect(a.weaponInstanceId).toBe(rend.id);
    }
  });
});
