// Slice 474: Spy poison-coated weapons (Shortsword + Hand Crossbow).
//
// RAW (SRD 5.2.1 Spy, CR 1):
// - "Shortsword. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2)
//   Piercing damage plus 7 (2d6) Poison damage."
// - "Hand Crossbow. Ranged Attack Roll: +4, range 30/120 ft. Hit:
//   5 (1d6 + 2) Piercing damage plus 7 (2d6) Poison damage."
//
// Wired as a pair of natural-weapon items (spy-shortsword +
// spy-hand-crossbow), each carrying a slice-316 unconditional onHit
// 2d6 poison rider. Same shape as Ghoul Bite's necrotic rider
// (slice 462). Distinct from the generic shortsword / crossbow-hand
// so adventurer-wielded versions don't inherit the poison.
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

const buildSpy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Spy',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'spy',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 15, CON: 10, INT: 12, WIS: 14, CHA: 16 },
    hp: { current: 27, max: 27, temp: 0 },
  });

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

describe('Spy poison weapons (slice 474)', () => {
  it('pack declares spy-shortsword as a martial melee weapon with a 2d6 poison onHit rider', () => {
    const ss = PACK.items.find((i) => i.id === 'spy-shortsword');
    expect(ss).toBeDefined();
    expect(ss && ss.itemKind === 'weapon' ? ss.attackKind : undefined).toBe('melee');
    expect(ss && ss.itemKind === 'weapon' ? ss.damageType : undefined).toBe('piercing');
    expect(ss && ss.itemKind === 'weapon' ? ss.damageDice : undefined).toBe('1d6');
    expect(ss && ss.itemKind === 'weapon' ? ss.properties : undefined).toEqual(['finesse', 'light']);
    expect(ss && ss.itemKind === 'weapon' ? ss.onHit : undefined).toEqual([
      { dice: '2d6', damageType: 'poison' },
    ]);
  });

  it('pack declares spy-hand-crossbow as a martial ranged weapon with a 2d6 poison onHit rider', () => {
    const hc = PACK.items.find((i) => i.id === 'spy-hand-crossbow');
    expect(hc).toBeDefined();
    expect(hc && hc.itemKind === 'weapon' ? hc.attackKind : undefined).toBe('ranged');
    expect(hc && hc.itemKind === 'weapon' ? hc.damageType : undefined).toBe('piercing');
    expect(hc && hc.itemKind === 'weapon' ? hc.damageDice : undefined).toBe('1d6');
    expect(hc && hc.itemKind === 'weapon' ? hc.rangeNormal : undefined).toBe(30);
    expect(hc && hc.itemKind === 'weapon' ? hc.rangeLong : undefined).toBe(120);
    expect(hc && hc.itemKind === 'weapon' ? hc.onHit : undefined).toEqual([
      { dice: '2d6', damageType: 'poison' },
    ]);
  });

  it('spy-shortsword hit: DamageRolled carries piercing primary + poison rider', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const ss = makeItemInstance('spy-shortsword');
      const spy = buildSpy();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'spy-shortsword' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: ss },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spy } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: spy.id,
        targetId: target.id,
        weaponInstanceId: ss.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const damage = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(damage).toBeDefined();
      const piercing = damage!.rolls.find((r) => r.type === 'piercing');
      const poison = damage!.rolls.find((r) => r.type === 'poison');
      expect(piercing).toBeDefined();
      expect(poison).toBeDefined();
      // 2d6 rider rolls in the [2, 12] range on a non-crit, [2, 24] on a crit.
      const poisonTotal = poison!.rolls.reduce((s, v) => s + v, 0);
      const minRoll = attack.critical === true ? 4 : 2;
      const maxRoll = attack.critical === true ? 24 : 12;
      expect(poisonTotal).toBeGreaterThanOrEqual(minRoll);
      expect(poisonTotal).toBeLessThanOrEqual(maxRoll);
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });

  it('spy-hand-crossbow hit: DamageRolled carries piercing primary + poison rider', () => {
    let attempt = 0;
    let proven = false;
    while (attempt < 60 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(100 + attempt) });
      const hc = makeItemInstance('spy-hand-crossbow');
      const spy = buildSpy();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'spy-hand-crossbow' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: hc },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spy } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: spy.id,
        targetId: target.id,
        weaponInstanceId: hc.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const damage = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      expect(damage).toBeDefined();
      const piercing = damage!.rolls.find((r) => r.type === 'piercing');
      const poison = damage!.rolls.find((r) => r.type === 'poison');
      expect(piercing).toBeDefined();
      expect(poison).toBeDefined();
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });

  it('generic shortsword + crossbow-hand do NOT carry the poison rider (adventurer weapons unaffected)', () => {
    const ss = PACK.items.find((i) => i.id === 'shortsword');
    const hc = PACK.items.find((i) => i.id === 'crossbow-hand');
    expect(ss && ss.itemKind === 'weapon' ? ss.onHit : undefined).toBeUndefined();
    expect(hc && hc.itemKind === 'weapon' ? hc.onHit : undefined).toBeUndefined();
  });
});
