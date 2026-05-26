// Slice 462: Ghoul Bite natural weapon.
//
// RAW (SRD 5.2.1 Ghoul): "Bite. Hit: 5 (1d6 + 2) Piercing damage
// plus 3 (1d6) Necrotic damage." Slice 462 ships ghoul-bite as
// itemKind 'weapon' with primary 1d6 piercing + slice-316
// unconditional onHit rider for the 1d6 necrotic arm. The Ghoul's
// Multiattack (two Bites per Attack action) stays deferred until
// the monster-Multiattack primitive ships.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildGhoul = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Ghoul',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'ghoul',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 13, DEX: 15, CON: 10, INT: 7, WIS: 10, CHA: 6 },
    hp: { current: 22, max: 22, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Ghoul Bite (slice 462)', () => {
  it('on a hit emits a DamageRolled with both piercing primary and necrotic rider', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const bite = makeItemInstance('ghoul-bite');
      const ghoul = buildGhoul();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'ghoul-bite' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ghoul } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: ghoul.id,
        targetId: target.id,
        weaponInstanceId: bite.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;

      const damage = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(damage).toBeDefined();
      const piercing = damage!.rolls.find((r) => r.type === 'piercing');
      const necrotic = damage!.rolls.find((r) => r.type === 'necrotic');
      expect(piercing).toBeDefined();
      expect(necrotic).toBeDefined();
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });
});
