// Slice 472: Scout Multiattack - second monster-Multiattack content
// user after Ghoul (slice 464).
//
// RAW (SRD 5.2.1 Scout, CR 1/2): "Multiattack. The scout makes two
// attacks, using Shortsword and Longbow in any combination."
//
// "Any combination" is a player choice at attack time (pure melee,
// pure ranged, or mixed). The MonsterMultiattack schema declares a
// concrete pattern; the canonical mixed-loadout interpretation
// (1 Shortsword + 1 Longbow) covers the mixed case directly, and a
// consumer who wants pure shortsword or pure longbow builds the
// runtime pattern from scratch instead of going through
// runtimeMultiattackFromStatblock.
//
// Both weapons (`shortsword` + `longbow`) are existing pack items,
// so the Scout is a pure-content slice with no engine changes.

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

describe('Scout Multiattack (slice 472)', () => {
  it('Scout statblock declares Multiattack: 1 Shortsword + 1 Longbow', () => {
    const scout = PACK.monsters.find((m) => m.id === 'scout');
    expect(scout).toBeDefined();
    expect(scout!.multiattack).toEqual({
      name: 'Scout Multiattack',
      attacks: [
        { weaponId: 'shortsword', count: 1 },
        { weaponId: 'longbow', count: 1 },
      ],
    });
  });

  it('runtimeMultiattackFromStatblock builds the runtime pattern with two distinct weapon instances', () => {
    const scout = PACK.monsters.find((m) => m.id === 'scout')!;
    const shortsword = makeItemInstance('shortsword');
    const longbow = makeItemInstance('longbow');
    const pattern = runtimeMultiattackFromStatblock(scout.multiattack!, {
      shortsword: shortsword.id,
      longbow: longbow.id,
    });
    expect(pattern.name).toBe('Scout Multiattack');
    expect(pattern.attacks).toEqual([
      { weaponInstanceId: shortsword.id, count: 1 },
      { weaponInstanceId: longbow.id, count: 1 },
    ]);
  });

  it('engine.plan.multiattack on a Scout emits exactly 2 AttackRolled events (one per weapon)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const scoutStatblock = PACK.monsters.find((m) => m.id === 'scout')!;
    const shortsword = makeItemInstance('shortsword');
    const longbow = makeItemInstance('longbow');
    const pattern = runtimeMultiattackFromStatblock(scoutStatblock.multiattack!, {
      shortsword: shortsword.id,
      longbow: longbow.id,
    });
    const scout: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Scout',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'scout',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 11, DEX: 14, CON: 12, INT: 11, WIS: 13, CHA: 11 },
      hp: { current: 16, max: 16, temp: 0 },
      multiattack: pattern,
    });
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'scout-multi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: shortsword },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longbow },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: scout } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: scout.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
    // The two swings used different weapon instances (one shortsword + one longbow).
    const weaponInstanceIds = attacks.map((a) => a.weaponInstanceId).sort();
    expect(weaponInstanceIds).toEqual([shortsword.id, longbow.id].sort());
  });
});
