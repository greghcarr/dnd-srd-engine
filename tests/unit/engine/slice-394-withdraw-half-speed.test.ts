// Slice 394 - Rogue Withdraw (Cunning Strike) is a half-Speed no-provoke
// budget, not a full-turn Disengage.
//
// RAW Withdraw: "you can move up to half your Speed without provoking
// Opportunity Attacks." The old wire emitted a plain `Disengaged`, which
// suppressed OAs for the WHOLE turn's movement (an over-grant). Now the
// Withdraw arm emits `Disengaged { limitedToFeet: floor(Speed/2) }`; the
// reducer stamps a `noProvokeMovementUpToFeet` high-water-mark on
// turnUsage, and the move planner suppresses OA provocation only while
// cumulative movement stays within that mark.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type {
  CombatantMovedEvent,
  DisengagedEvent,
  OpportunityAvailableEvent,
} from '../../../src/schemas/events/movement.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
// Human walk Speed 30 -> Withdraw grants a 15 ft no-provoke budget.
const HALF_SPEED = 15;

const buildRogue = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Vex', speciesId: 'human', backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 5, hitDiceRemaining: 5, subclassId: 'thief' }],
    abilityScores: { STR: 10, DEX: 18, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
  });

// Low AC so the advantage attack lands and Sneak Attack (hence Withdraw)
// fires.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mark', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 5,
  });

const seedEncounter = (rogue: Character, target: Character, seed: number): Campaign => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const dagger = makeItemInstance('dagger');
  let campaign: Campaign = engine.createCampaign({ name: 'withdraw' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const encId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId: encId, combatantIds: [rogue.id, target.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encId, rolls: [
      { combatantId: rogue.id, d20: 20, modifier: 0, total: 20 },
      { combatantId: target.id, d20: 2, modifier: 0, total: 2 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: encId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: encId, combatantId: rogue.id, round: 1 } satisfies TurnStartedEvent,
    // Rogue adjacent to the target (5 ft = melee reach); both positioned via
    // zero-cost CombatantMoved so neither spends movement.
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: encId, combatantId: rogue.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 5, y: 5 }, feetTraveled: 0 } satisfies CombatantMovedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: encId, combatantId: target.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 10, y: 5 }, feetTraveled: 0 } satisfies CombatantMovedEvent,
  ]);
  return campaign;
};

// Runs an advantage attack with the Withdraw Cunning Strike until it hits,
// returning the resolution events.
const withdrawUntilHit = (rogue: Character, target: Character): ReadonlyArray<Event> => {
  for (let seed = 1; seed < 90; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const campaign = seedEncounter(rogue, target, seed);
    const events = engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id,
      weaponInstanceId: campaign.state.itemInstances[Object.keys(campaign.state.itemInstances)[0]!]!.id,
      advantage: 'advantage', cunningStrike: ['withdraw'],
    }).events as ReadonlyArray<Event>;
    void engine;
    if ((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) return events;
  }
  throw new Error('no hitting seed');
};

describe('slice 394: Withdraw emits a half-Speed no-provoke budget', () => {
  it('the Disengaged event carries limitedToFeet = floor(Speed/2), not a full-turn Disengage', () => {
    const events = withdrawUntilHit(buildRogue(), buildTarget());
    const disengaged = events.find((e): e is DisengagedEvent => e.type === 'Disengaged');
    expect(disengaged).toBeDefined();
    expect(disengaged!.limitedToFeet).toBe(HALF_SPEED);
  });
});

describe('slice 394: the no-provoke budget gates OA provocation by distance', () => {
  // Build a clean encounter where the rogue is adjacent to an enemy, with
  // a Withdraw no-provoke mark already stamped on the rogue's turnUsage.
  const setupWithMark = (): { engine: ReturnType<typeof createEngine>; campaign: Campaign; rogueId: string } => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const rogue = buildRogue();
    const target = buildTarget();
    let campaign = seedEncounter(rogue, target, 1);
    const encId = campaign.state.activeEncounterId!;
    // Stamp the half-Speed no-provoke mark (what Withdraw's Disengaged does).
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'Disengaged', encounterId: encId, combatantId: rogue.id, limitedToFeet: HALF_SPEED } satisfies DisengagedEvent,
    ]);
    return { engine, campaign, rogueId: rogue.id };
  };

  it('a move within half Speed out of reach does NOT provoke', () => {
    const { engine, campaign, rogueId } = setupWithMark();
    // From (5,5), 15 ft to (20,5): leaves the enemy's reach but stays
    // within the 15 ft budget.
    const { events } = engine.plan.move(campaign.state, { combatantId: rogueId, to: { x: 20, y: 5 } });
    expect(events.some((e) => e.type === 'OpportunityAvailable')).toBe(false);
  });

  it('a move beyond half Speed out of reach DOES provoke', () => {
    const { engine, campaign, rogueId } = setupWithMark();
    // From (5,5), 20 ft to (25,5): exceeds the 15 ft budget, so the last
    // foot of movement out of reach provokes.
    const { events } = engine.plan.move(campaign.state, { combatantId: rogueId, to: { x: 25, y: 5 } });
    const oas = events.filter((e): e is OpportunityAvailableEvent => e.type === 'OpportunityAvailable');
    expect(oas).toHaveLength(1);
  });

  it('without a Withdraw mark, leaving reach provokes as normal (baseline)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const rogue = buildRogue();
    const target = buildTarget();
    const campaign = seedEncounter(rogue, target, 1);
    const { events } = engine.plan.move(campaign.state, { combatantId: rogue.id, to: { x: 20, y: 5 } });
    expect(events.some((e) => e.type === 'OpportunityAvailable')).toBe(true);
  });
});
