// Slice 380 - Monk Open Hand Technique (Warrior of the Open Hand, L3).
//
// Whenever a Flurry of Blows strike hits, the monk may impose one effect:
//   - Addle: the target can't make Opportunity Attacks until its next turn
//     (the OA planner reads the new `addled` condition and refuses).
//   - Push: Strength save vs the Monk's Ki DC (8 + PB + WIS) or pushed 15 ft.
//   - Topple: Dexterity save vs the same DC or Prone.
// The rider rides the existing Flurry planner; the chosen technique applies
// on every hit of the Flurry (RAW allows a per-hit choice).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../../src/rng/throw.js';
import { replay } from '../../../src/engine/replay.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

// `subclassId: null` builds a generic Monk (no subclass), so we don't rely
// on the default-parameter / undefined interaction.
const buildMonk = (subclassId: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Lin', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'monk', level: 5, hitDiceRemaining: 5, ...(subclassId !== null ? { subclassId } : {}) }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 35, max: 35, temp: 0 },
    resources: [{ resourceId: 'ki', current: 5, max: 5 }],
  });
const buildOpenHandMonk = (): Character => buildMonk('warrior-of-the-open-hand');

// A flimsy target: low AC so strikes land, dump STR/DEX so the Push/Topple
// saves usually fail.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Dummy', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 4, DEX: 4, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 5,
  });

const seedFlurry = (monk: Character, target: Character) => {
  const fist = makeItemInstance('unarmed-strike');
  let campaign: Campaign = createEngine({ contentPacks: [PACK], rng: seededRNG(1) }).createCampaign({ name: 'oht' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { campaign, fistId: fist.id };
};

// Runs Flurry with a technique across seeds until at least one strike hits,
// returning that resolution's events.
const flurryWithTechnique = (technique: 'addle' | 'push' | 'topple'): ReadonlyArray<Event> => {
  const monk = buildOpenHandMonk();
  const target = buildTarget();
  const { campaign, fistId } = seedFlurry(monk, target);
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const events = engine.plan.flurryOfBlows(campaign.state, {
      monkId: monk.id, targetId: target.id, weaponInstanceId: fistId, openHandTechnique: technique,
    }).events as ReadonlyArray<Event>;
    if (events.some((e) => e.type === 'AttackRolled' && (e as AttackRolledEvent).hit === true)) return events;
  }
  throw new Error(`no seed produced a Flurry hit for ${technique}`);
};

describe('slice 380: Open Hand Technique', () => {
  it('requires the Warrior of the Open Hand subclass', () => {
    const monk = buildMonk(null); // generic monk, no subclass
    const target = buildTarget();
    const { campaign, fistId } = seedFlurry(monk, target);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    expect(() =>
      engine.plan.flurryOfBlows(campaign.state, {
        monkId: monk.id, targetId: target.id, weaponInstanceId: fistId, openHandTechnique: 'topple',
      }),
    ).toThrow(/Open Hand Technique/);
  });

  it('a plain Flurry (no technique) emits no Open Hand events', () => {
    const monk = buildOpenHandMonk();
    const target = buildTarget();
    const { campaign, fistId } = seedFlurry(monk, target);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const events = engine.plan.flurryOfBlows(campaign.state, {
      monkId: monk.id, targetId: target.id, weaponInstanceId: fistId,
    }).events as ReadonlyArray<Event>;
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });

  it('Addle applies the addled condition on a hit (no save)', () => {
    const events = flurryWithTechnique('addle');
    const addled = events.filter(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'addled',
    );
    expect(addled.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
  });

  it('Topple rolls a DEX save on a hit and applies Prone on a failure', () => {
    const events = flurryWithTechnique('topple');
    const saves = events.filter((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.every((s) => s.ability === 'DEX')).toBe(true);
    // The dump-DEX target fails, so at least one Prone lands.
    const prone = events.filter(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'prone',
    );
    expect(prone.length).toBeGreaterThanOrEqual(1);
  });

  it('Push rolls a STR save on a hit', () => {
    const events = flurryWithTechnique('push');
    const saves = events.filter((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.every((s) => s.ability === 'STR')).toBe(true);
  });

  it('the Addle flurry replays deterministically and consumes no RNG in apply', () => {
    const monk = buildOpenHandMonk();
    const target = buildTarget();
    const { campaign, fistId } = seedFlurry(monk, target);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const events = engine.plan.flurryOfBlows(campaign.state, {
      monkId: monk.id, targetId: target.id, weaponInstanceId: fistId, openHandTechnique: 'addle',
    }).events;
    const after = commit(campaign, events);
    expect(JSON.stringify(replay(after.events))).toBe(JSON.stringify(after.state));
    void throwOnCallRNG();
    expect(() => replay(after.events)).not.toThrow();
  });
});

describe('slice 380: Addled bars Opportunity Attacks', () => {
  it('an Addled creature cannot make an Opportunity Attack', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const fist = makeItemInstance('unarmed-strike');
    const active = buildTarget();
    const reactor = buildOpenHandMonk();
    let campaign: Campaign = engine.createCampaign({ name: 'oa-addled' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: active } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: reactor } satisfies CharacterCreatedEvent,
    ]);
    const encounterId = newEncounterId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [active.id, reactor.id] } satisfies EncounterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
        { combatantId: active.id, d20: 20, modifier: 0, total: 20 },
        { combatantId: reactor.id, d20: 5, modifier: 0, total: 5 },
      ] } satisfies InitiativeRolledEvent,
      { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: active.id, round: 1 } satisfies TurnStartedEvent,
      // The reactor is Addled (e.g. by an earlier Open Hand strike).
      { id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId: reactor.id, conditionId: 'addled', appliedConditionId: newCharacterId() as never },
    ]);
    expect(() =>
      engine.plan.opportunityAttack(campaign.state, { reactorId: reactor.id, targetId: active.id, weaponInstanceId: fist.id }),
    ).toThrow(/Addled/);
  });
});
