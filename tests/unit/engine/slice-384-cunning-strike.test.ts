// Slice 384 - Rogue Cunning Strike (L5) + Improved Cunning Strike (L11).
//
// When the rogue deals Sneak Attack damage, they may forgo Sneak Attack
// dice to add an effect (each L5 option costs 1d6): Poison (CON save or
// Poisoned), Trip (DEX save or Prone), Withdraw (Disengage). The dice are
// removed before rolling, so the Sneak Attack damage shrinks. L5 allows
// one effect; L11 (Improved Cunning Strike) allows two. Devious Strikes
// (L14) is deferred.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { TriggerFiredEvent } from '../../../src/schemas/events/triggers.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildRogue = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Vex', speciesId: 'human', backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level, hitDiceRemaining: level, subclassId: 'thief' }],
    abilityScores: { STR: 10, DEX: 18, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 10 * level, max: 10 * level, temp: 0 },
  });

// Low AC so the advantage attack lands; dumped CON/DEX so the Cunning
// Strike saves fail.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mark', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 4, CON: 4, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 5,
  });

const seedRogue = (rogue: Character, target: Character, seed: number, withEncounter = false) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const dagger = makeItemInstance('dagger');
  let campaign: Campaign = engine.createCampaign({ name: 'cs' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  if (withEncounter) {
    const encId = newEncounterId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId: encId, combatantIds: [rogue.id, target.id] } satisfies EncounterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encId, rolls: [
        { combatantId: rogue.id, d20: 20, modifier: 0, total: 20 },
        { combatantId: target.id, d20: 2, modifier: 0, total: 2 },
      ] } satisfies InitiativeRolledEvent,
      { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: encId } satisfies EncounterStartedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: encId, combatantId: rogue.id, round: 1 } satisfies TurnStartedEvent,
    ]);
  }
  return { engine, campaign, daggerId: dagger.id };
};

const sneakDamage = (events: ReadonlyArray<Event>): number => {
  const triggerIds = new Set(
    events.filter((e): e is TriggerFiredEvent => e.type === 'TriggerFired').map((e) => e.id),
  );
  const sneak = events.find(
    (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && triggerIds.has(e.causedByEventId ?? ''),
  );
  return sneak?.components.reduce((s, c) => s + c.amount, 0) ?? 0;
};

// Runs an advantage attack until it hits (so Sneak Attack fires) and
// returns the resolution events.
const attackUntilHit = (
  rogue: Character, target: Character, cunningStrike?: ReadonlyArray<'poison' | 'trip' | 'withdraw'>, withEncounter = false,
): ReadonlyArray<Event> => {
  for (let seed = 1; seed < 90; seed += 1) {
    const { engine, campaign, daggerId } = seedRogue(rogue, target, seed, withEncounter);
    const events = engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage',
      ...(cunningStrike !== undefined ? { cunningStrike } : {}),
    }).events as ReadonlyArray<Event>;
    if ((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) return events;
  }
  throw new Error('no hitting seed');
};

describe('slice 384: Cunning Strike forgoes Sneak Attack dice', () => {
  it('Poison forgoes 1d6: an L5 rogue\'s Sneak Attack never exceeds 2d6 (12) with Poison, but can exceed it without', () => {
    const rogue = buildRogue(5); // 3d6 Sneak Attack
    const target = buildTarget();
    let maxWith = 0;
    let maxWithout = 0;
    // Exclude crits: a crit doubles the (already-reduced) Sneak Attack
    // dice, so the die-count comparison must use non-crit hits only.
    const nonCritHit = (events: ReadonlyArray<Event>): boolean => {
      const ar = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      return ar?.hit === true && ar.critical !== true;
    };
    for (let seed = 1; seed < 90; seed += 1) {
      const w = seedRogue(rogue, target, seed);
      const evWith = w.engine.plan.attack(w.campaign.state, {
        attackerId: rogue.id, targetId: target.id, weaponInstanceId: w.daggerId, advantage: 'advantage', cunningStrike: ['poison'],
      }).events as ReadonlyArray<Event>;
      if (nonCritHit(evWith)) maxWith = Math.max(maxWith, sneakDamage(evWith));
      const wo = seedRogue(rogue, target, seed);
      const evWithout = wo.engine.plan.attack(wo.campaign.state, {
        attackerId: rogue.id, targetId: target.id, weaponInstanceId: wo.daggerId, advantage: 'advantage',
      }).events as ReadonlyArray<Event>;
      if (nonCritHit(evWithout)) maxWithout = Math.max(maxWithout, sneakDamage(evWithout));
    }
    expect(maxWith).toBeLessThanOrEqual(12); // 2d6 after forgoing 1 (non-crit)
    expect(maxWithout).toBeGreaterThan(12); // 3d6 can exceed 12 (non-crit)
  });
});

describe('slice 384: Cunning Strike effects', () => {
  it('Poison: a CON save fires; on a failure the target is Poisoned', () => {
    const events = attackUntilHit(buildRogue(5), buildTarget(), ['poison']);
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(save?.ability).toBe('CON');
    // Dumped-CON target fails, so Poisoned lands.
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'poisoned')).toBe(true);
  });

  it('Trip: a DEX save fires; on a failure the target is Prone', () => {
    const events = attackUntilHit(buildRogue(5), buildTarget(), ['trip']);
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(save?.ability).toBe('DEX');
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'prone')).toBe(true);
  });

  it('Withdraw: the rogue Disengages (in an encounter)', () => {
    const events = attackUntilHit(buildRogue(5), buildTarget(), ['withdraw'], true);
    expect(events.some((e) => e.type === 'Disengaged')).toBe(true);
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false); // Withdraw has no save
  });

  it('Improved Cunning Strike (L11) allows two effects in one Sneak Attack', () => {
    const events = attackUntilHit(buildRogue(11), buildTarget(), ['poison', 'trip']);
    const saves = events.filter((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(saves.map((s) => s.ability).sort()).toEqual(['CON', 'DEX']);
  });
});

describe('slice 384: Cunning Strike validation', () => {
  const target = buildTarget();
  it('a rogue below L5 cannot use Cunning Strike', () => {
    const rogue = buildRogue(3);
    const { engine, campaign, daggerId } = seedRogue(rogue, target, 1);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage', cunningStrike: ['poison'],
    })).toThrow(/Cunning Strike/);
  });

  it('an L5 rogue cannot use two effects (one effect cap before Improved Cunning Strike)', () => {
    const rogue = buildRogue(5);
    const { engine, campaign, daggerId } = seedRogue(rogue, target, 1);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage', cunningStrike: ['poison', 'trip'],
    })).toThrow(/at most 1/);
  });

  it('a non-rogue cannot use Cunning Strike', () => {
    const fighter = CharacterSchema.parse({
      id: newCharacterId(), name: 'Borin', speciesId: 'dwarf', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 8, hitDiceRemaining: 8 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 64, max: 64, temp: 0 },
    });
    const { engine, campaign, daggerId } = seedRogue(fighter, target, 1);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: fighter.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage', cunningStrike: ['poison'],
    })).toThrow(/does not have Cunning Strike/);
  });
});
