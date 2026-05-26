// Slice 473: Cultist Ritual Sickle natural weapon.
//
// RAW (SRD 5.2.1 Cultist, CR 1/8): "Ritual Sickle. Melee Attack
// Roll: +3, reach 5 ft. Hit: 3 (1d4 + 1) Slashing damage plus
// 1 Necrotic damage."
//
// Wired as a regular sickle base (1d4 slashing, light, Nick mastery)
// with a slice-316 unconditional onHit flat-1 necrotic rider via the
// 0d6+1 flat-damage shape (mirrors Mace of Smiting's +7 crit rider
// pattern). Distinct from the generic `sickle` so adventurer-wielded
// sickles don't inherit the cultist's necrotic rider.
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

const buildCultist = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Cultist',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'cultist',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 11, DEX: 12, CON: 10, INT: 10, WIS: 11, CHA: 10 },
    hp: { current: 9, max: 9, temp: 0 },
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

describe('Cultist Ritual Sickle (slice 473)', () => {
  it('pack declares ritual-sickle as a simple slashing weapon with a flat necrotic onHit rider', () => {
    const sickle = PACK.items.find((i) => i.id === 'ritual-sickle');
    expect(sickle).toBeDefined();
    expect(sickle && sickle.itemKind === 'weapon' ? sickle.damageType : undefined).toBe('slashing');
    expect(sickle && sickle.itemKind === 'weapon' ? sickle.damageDice : undefined).toBe('1d4');
    expect(sickle && sickle.itemKind === 'weapon' ? sickle.onHit : undefined).toEqual([
      { dice: '0d6+1', damageType: 'necrotic' },
    ]);
  });

  it('on a hit: DamageRolled carries both slashing primary and exactly 1 necrotic from the rider', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const sickle = makeItemInstance('ritual-sickle');
      const cultist = buildCultist();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'ritual-sickle' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sickle },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cultist } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: cultist.id,
        targetId: target.id,
        weaponInstanceId: sickle.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      // On a non-critical hit, the necrotic rider's 0d6+1 evaluates to
      // a flat 1. On a critical, riders may double per RAW; skip those
      // attempts to keep the assertion exact.
      if (attack.critical === true) continue;
      const damage = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(damage).toBeDefined();
      const slashing = damage!.rolls.find((r) => r.type === 'slashing');
      const necrotic = damage!.rolls.find((r) => r.type === 'necrotic');
      expect(slashing).toBeDefined();
      expect(necrotic).toBeDefined();
      const necroticTotal = necrotic!.rolls.reduce((s, v) => s + v, 0) + necrotic!.modifier;
      expect(necroticTotal).toBe(1);
      proven = true;
    }
    expect(proven, `no non-crit hit in ${attempt} seeds`).toBe(true);
  });

  it('the generic `sickle` weapon does NOT carry the necrotic rider (adventurer sickles unaffected)', () => {
    const sickle = PACK.items.find((i) => i.id === 'sickle');
    expect(sickle).toBeDefined();
    expect(sickle && sickle.itemKind === 'weapon' ? sickle.onHit : undefined).toBeUndefined();
  });
});
