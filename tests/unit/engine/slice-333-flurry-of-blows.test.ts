// Slice 333 — Monk's Focus: Flurry of Blows. Spend 1 Focus Point as a
// Bonus Action to make two Unarmed Strikes (three at Monk level 10+ via
// Heightened Focus). The strikes resolve through the normal attack path.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../../src/rng/throw.js';
import { replay } from '../../../src/engine/replay.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildMonk = (level: number, kiCurrent: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Lin', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    resources: [{ resourceId: 'ki', current: kiCurrent, max: level }],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Dummy', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 8,
  });

interface Setup { engine: ReturnType<typeof createEngine>; campaign: Campaign; monkId: string; targetId: string; fistId: string; }

const setup = (opts: { level: number; ki: number; weaponDefId?: string }): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
  const fist = makeItemInstance(opts.weaponDefId ?? 'unarmed-strike');
  const monk = buildMonk(opts.level, opts.ki);
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'flurry' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, monkId: monk.id, targetId: target.id, fistId: fist.id };
};

describe('slice 333: Flurry of Blows', () => {
  it('spends 1 Focus Point and makes two unarmed strikes (Monk L2)', () => {
    const s = setup({ level: 2, ki: 2 });
    const events = s.engine.plan.flurryOfBlows(s.campaign.state, { monkId: s.monkId, targetId: s.targetId, weaponInstanceId: s.fistId }).events;
    const spent = events.filter((e): e is ResourceSpentEvent => e.type === 'ResourceSpent');
    expect(spent).toHaveLength(1);
    expect(spent[0]!.resourceId).toBe('ki');
    expect(spent[0]!.amount).toBe(1);
    expect(events.filter((e): e is AttackRolledEvent => e.type === 'AttackRolled')).toHaveLength(2);
    // Spending the focus point leaves the monk with 1, and replay holds.
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.monkId]!.resources.find((r) => r.resourceId === 'ki')!.current).toBe(1);
    expect(JSON.stringify(replay(after.events))).toBe(JSON.stringify(after.state));
    void throwOnCallRNG();
    expect(() => replay(after.events)).not.toThrow();
  });

  it('makes three unarmed strikes at Monk level 10 (Heightened Focus)', () => {
    const s = setup({ level: 10, ki: 5 });
    const events = s.engine.plan.flurryOfBlows(s.campaign.state, { monkId: s.monkId, targetId: s.targetId, weaponInstanceId: s.fistId }).events;
    expect(events.filter((e): e is AttackRolledEvent => e.type === 'AttackRolled')).toHaveLength(3);
  });

  it('throws with no Focus Points', () => {
    const s = setup({ level: 5, ki: 0 });
    expect(() =>
      s.engine.plan.flurryOfBlows(s.campaign.state, { monkId: s.monkId, targetId: s.targetId, weaponInstanceId: s.fistId }),
    ).toThrow(/no Focus Points/);
  });

  it('throws when the weapon is not an unarmed strike', () => {
    const s = setup({ level: 5, ki: 3, weaponDefId: 'longsword' });
    expect(() =>
      s.engine.plan.flurryOfBlows(s.campaign.state, { monkId: s.monkId, targetId: s.targetId, weaponInstanceId: s.fistId }),
    ).toThrow(/Unarmed Strikes/);
  });

  it('throws for a non-Monk', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const fist = makeItemInstance('unarmed-strike');
    const notMonk = CharacterSchema.parse({
      id: newCharacterId(), name: 'Borin', speciesId: 'dwarf', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 44, max: 44, temp: 0 },
      resources: [{ resourceId: 'ki', current: 3, max: 3 }],
    });
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: 'no-monk' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: notMonk } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.flurryOfBlows(campaign.state, { monkId: notMonk.id, targetId: target.id, weaponInstanceId: fist.id }),
    ).toThrow(/Monk's Focus/);
  });
});
