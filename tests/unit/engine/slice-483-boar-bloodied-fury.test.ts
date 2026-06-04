// Slice 483: Boar Bloodied Fury (engine + content).
//
// RAW (SRD 5.2.1 Boar): "Bloodied Fury. While Bloodied, the boar has
// Advantage on attack rolls." 2024 Bloodied: HP <= floor(max/2).
//
// Engine: adds `bearer.bloodied` to the attacker-side advantage facts
// (slice 483). Unlike `bearer.lightLevel` / `bearer.canSeeFearSource`
// (consumer-supplied scene facts), bloodied is derived engine-side
// from attacker HP since the engine already owns it. First slice to
// surface this fact; future "while bloodied" features reuse it.
//
// Content: Boar statblock declares one SetAdvantage trait gated on
// `bearer.bloodied = true`.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildBoar = (hp: { current: number; max: number }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Boar',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'boar',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 13, DEX: 11, CON: 14, INT: 2, WIS: 9, CHA: 5 },
    hp: { current: hp.current, max: hp.max, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const runAttack = (boarHp: { current: number; max: number }): AttackRolledEvent => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const dagger = makeItemInstance('dagger');
  const boar = buildBoar(boarHp);
  const target = buildTarget();
  let campaign = engine.createCampaign({ name: `boar-hp-${boarHp.current}-of-${boarHp.max}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: boar } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: boar.id,
    targetId: target.id,
    weaponInstanceId: dagger.id,
  }).events;
  return events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent;
};

describe('Boar Bloodied Fury (slice 483)', () => {
  it('boar statblock declares a bearer.bloodied SetAdvantage trait', () => {
    const boar = PACK.monsters.find((m) => m.id === 'boar');
    expect(boar?.traits).toEqual([
      { kind: 'SetAdvantage', on: 'attack', mode: 'advantage', condition: { kind: 'eq', path: 'bearer.bloodied', value: true } },
    ]);
  });

  it('at full HP (13/13) the boar attacks normally', () => {
    const r = runAttack({ current: 13, max: 13 });
    expect(r.used).toBe('none');
    expect(r.d20.length).toBe(1);
  });

  it('just above half HP (7/13) the boar attacks normally', () => {
    // floor(13/2) = 6; 7 > 6, not bloodied.
    const r = runAttack({ current: 7, max: 13 });
    expect(r.used).toBe('none');
    expect(r.d20.length).toBe(1);
  });

  it('at half HP (6/13 = floor(13/2)) the boar has advantage', () => {
    // floor(13/2) = 6; 6 <= 6, bloodied.
    const r = runAttack({ current: 6, max: 13 });
    expect(r.used).toBe('advantage');
    expect(r.d20.length).toBe(2);
  });

  it('at 1 HP the boar has advantage', () => {
    const r = runAttack({ current: 1, max: 13 });
    expect(r.used).toBe('advantage');
    expect(r.d20.length).toBe(2);
  });

  it('at exactly half on an even max (5/10) the boar has advantage', () => {
    // floor(10/2) = 5; 5 <= 5, bloodied.
    const r = runAttack({ current: 5, max: 10 });
    expect(r.used).toBe('advantage');
    expect(r.d20.length).toBe(2);
  });
});
