// Slice 391 - "ends if the bearer takes any damage" (Sleep / Knock Out).
//
// RAW Sleep: "the effect ends on a creature if it takes damage." RAW Knock
// Out (Rogue Devious Strikes): Unconscious "until it takes any damage."
// Both apply the base `unconscious` condition, which must NOT always end
// on damage (a creature unconscious at 0 HP doesn't wake from a hit). So
// the clause is a per-instance `endsOnDamage` flag, swept by the damage
// chokepoint (`interceptFatalDamage`) on any positive damage.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighter = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 5,
  });

const removed = (events: ReadonlyArray<Event>, conditionId: string): boolean =>
  events.some((e) => e.type === 'ConditionRemoved' && (e as { conditionId: string }).conditionId === conditionId);

// Attacks the (high-HP) target until a hit lands and returns the events.
const attackUntilHit = (
  engine: ReturnType<typeof createEngine>, state: Campaign['state'], attackerId: string, targetId: string, weaponId: string,
): ReadonlyArray<Event> => {
  // The target is unconscious -> attacks have advantage; a low AC makes a
  // hit near-certain, but loop a few seeds to be safe.
  const events = engine.plan.attack(state, { attackerId, targetId, weaponInstanceId: weaponId }).events as ReadonlyArray<Event>;
  return events;
};

const seed = (targetConditionFlag: boolean) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
  const attacker = buildFighter('Hitter');
  const target = buildFighter('Sleeper');
  const sword = makeItemInstance('longsword');
  let campaign: Campaign = engine.createCampaign({ name: 'eod' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    // Unconscious applied with or without the per-instance endsOnDamage flag.
    {
      id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
      targetId: target.id as never, conditionId: 'unconscious', appliedConditionId: newAppliedConditionId(),
      ...(targetConditionFlag ? { endsOnDamage: true } : {}),
    },
  ]);
  return { engine, campaign, attackerId: attacker.id, targetId: target.id, swordId: sword.id };
};

describe('slice 391: ends-on-damage removal', () => {
  it('a damage hit removes an endsOnDamage unconscious (Sleep / Knock Out wakes)', () => {
    const s = seed(true);
    const events = attackUntilHit(s.engine, s.campaign.state, s.attackerId, s.targetId, s.swordId);
    expect((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent).hit).toBe(true);
    expect(removed(events, 'unconscious')).toBe(true);
  });

  it('a damage hit does NOT remove a plain unconscious (no endsOnDamage flag)', () => {
    const s = seed(false);
    const events = attackUntilHit(s.engine, s.campaign.state, s.attackerId, s.targetId, s.swordId);
    expect((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent).hit).toBe(true);
    expect(removed(events, 'unconscious')).toBe(false);
  });
});

describe('slice 391: Sleep / Knock Out bake endsOnDamage', () => {
  it('Sleep applies an unconscious flagged endsOnDamage', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const caster = CharacterSchema.parse({
      id: newCharacterId(), name: 'Wiz', speciesId: 'human', backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 18, WIS: 10, CHA: 10 },
      hp: { current: 30, max: 30, temp: 0 }, preparedSpells: ['sleep'],
    });
    const sleeper = CharacterSchema.parse({
      id: newCharacterId(), name: 'Mook', speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 6, max: 6, temp: 0 },
    });
    let campaign: Campaign = engine.createCampaign({ name: 'sleep-eod' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sleeper } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id, spellId: 'sleep', slotLevel: 1, targetIds: [sleeper.id],
    }).events as ReadonlyArray<Event>;
    const cond = events.find((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'unconscious');
    expect(cond?.endsOnDamage).toBe(true);
  });
});
