// Slice 625: Martial Arts Die scaling applies to monk weapons too,
// not just unarmed strikes.
//
// RAW 2024 Monk L1 Martial Arts → Martial Arts Die: "You can roll
// 1d6 in place of the normal damage of your Unarmed Strike OR Monk
// weapons." Slice 623 fixed the Dexterous Attacks arm (use DEX over
// STR for monk weapons) via a `martialArtsApplies` helper, but the
// die-scaling arm (`applyMartialArtsDieScaling`) was still narrowed
// to unarmed-strike. Slice-624 fuzz at seed 5508 surfaced: monk with
// a sickle (Light simple melee, monk-eligible) still rolled 1d4
// instead of the L1 Martial Arts die of 1d6.
//
// Fix: applyMartialArtsDieScaling now keys off the same
// `martialArtsApplies(character, weapon)` gate. Both Martial Arts
// arms share the RAW gate (monk + monk-eligible weapon + no armor +
// no shield).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildMonk = (
  weaponInstanceId: string,
  opts: { armor?: string; shield?: string; level?: number } = {},
): Character => {
  return CharacterSchema.parse({
    id: newCharacterId(), name: 'Kai', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'monk', level: opts.level ?? 1, hitDiceRemaining: opts.level ?? 1 }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    hp: { current: 30, max: 30, temp: 0 },
    inventory: [weaponInstanceId, ...(opts.armor !== undefined ? [opts.armor] : []), ...(opts.shield !== undefined ? [opts.shield] : [])],
    equipped: {
      mainHand: weaponInstanceId,
      ...(opts.armor !== undefined ? { armor: opts.armor } : {}),
      ...(opts.shield !== undefined ? { shield: opts.shield } : {}),
      attuned: [],
    },
  });
};

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Borc', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
  });

const damageExpression = (events: ReadonlyArray<unknown>): string | undefined => {
  const dr = (events as ReadonlyArray<{ type: string }>).find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
  return dr?.rolls[0]?.expression;
};

describe('slice 625: Martial Arts Die scales monk weapons, not just unarmed strikes', () => {
  it('monk L1 wielding a sickle (1d4 monk weapon) rolls 1d6 (Martial Arts die)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const sickle = makeItemInstance('sickle');
    const kai = buildMonk(sickle.id);
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'monk-sickle' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sickle },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kai } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    let sawHit = false;
    for (let seed = 0; seed < 30 && !sawHit; seed += 1) {
      const e = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const r = e.plan.attack(campaign.state, { attackerId: kai.id, targetId: borc.id, weaponInstanceId: sickle.id });
      const expr = damageExpression(r.events);
      if (expr === undefined) continue;
      sawHit = true;
      expect(
        expr,
        `monk sickle should scale to L1 Martial Arts die (1d6), got ${expr}`,
      ).toBe('1d6');
    }
    expect(sawHit, 'no hit landed across 30 seeds (test would silently pass)').toBe(true);
  });

  it('monk L5 wielding a sickle rolls 1d8 (L5 Martial Arts die)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const sickle = makeItemInstance('sickle');
    const kai = buildMonk(sickle.id, { level: 5 });
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'monk-sickle-l5' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sickle },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kai } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    let sawHit = false;
    for (let seed = 0; seed < 30 && !sawHit; seed += 1) {
      const e = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const r = e.plan.attack(campaign.state, { attackerId: kai.id, targetId: borc.id, weaponInstanceId: sickle.id });
      const expr = damageExpression(r.events);
      if (expr === undefined) continue;
      sawHit = true;
      expect(expr).toBe('1d8');
    }
    expect(sawHit).toBe(true);
  });

  it('armored monk does NOT get die scaling (RAW gate: no armor)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const sickle = makeItemInstance('sickle');
    const armor = makeItemInstance('leather-armor');
    const kai = buildMonk(sickle.id, { armor: armor.id });
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'monk-armored' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sickle },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armor },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kai } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    let sawHit = false;
    for (let seed = 0; seed < 30 && !sawHit; seed += 1) {
      const e = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const r = e.plan.attack(campaign.state, { attackerId: kai.id, targetId: borc.id, weaponInstanceId: sickle.id });
      const expr = damageExpression(r.events);
      if (expr === undefined) continue;
      sawHit = true;
      expect(
        expr,
        'armored monk loses Martial Arts; sickle stays at its native 1d4',
      ).toBe('1d4');
    }
    expect(sawHit).toBe(true);
  });

  it('monk wielding a greatsword (NOT a monk weapon -- two-handed martial) keeps native die', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const greatsword = makeItemInstance('greatsword');
    const kai = buildMonk(greatsword.id);
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'monk-greatsword' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: greatsword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kai } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    let sawHit = false;
    for (let seed = 0; seed < 30 && !sawHit; seed += 1) {
      const e = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const r = e.plan.attack(campaign.state, { attackerId: kai.id, targetId: borc.id, weaponInstanceId: greatsword.id });
      const expr = damageExpression(r.events);
      if (expr === undefined) continue;
      sawHit = true;
      expect(
        expr,
        'greatsword is martial two-handed -- not monk-eligible. Native die 2d6 stays.',
      ).toBe('2d6');
    }
    expect(sawHit).toBe(true);
  });

  it('unarmed strike still scales (the original, narrow path)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const fist = makeItemInstance('unarmed-strike');
    const kai = buildMonk(fist.id);
    const borc = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'monk-unarmed' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kai } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: borc } satisfies CharacterCreatedEvent,
    ]);
    let sawHit = false;
    for (let seed = 0; seed < 30 && !sawHit; seed += 1) {
      const e = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const r = e.plan.attack(campaign.state, { attackerId: kai.id, targetId: borc.id, weaponInstanceId: fist.id });
      const expr = damageExpression(r.events);
      if (expr === undefined) continue;
      sawHit = true;
      expect(expr).toBe('1d6');
    }
    expect(sawHit).toBe(true);
  });
});
