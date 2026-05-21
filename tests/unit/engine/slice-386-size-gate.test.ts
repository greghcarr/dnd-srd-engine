// Slice 386 - "Large or smaller" size gate (full-RAW conversion).
//
// Two RAW effects gate on target size: Cunning Strike Trip ("If the
// target is Large or smaller, it must succeed on a DEX save or Prone")
// and weapon-mastery Push ("push the creature ... if it is Large or
// smaller"). Both previously ignored the gate. The shared
// `creatureSize` / `isLargeOrSmaller` helper now gates them: a bigger
// target gets no save (Trip) and isn't moved (Push).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { creatureSize, isLargeOrSmaller } from '../../../src/derive/creature-size.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildRogue = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Vex', speciesId: 'human', backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 5, hitDiceRemaining: 5, subclassId: 'thief' }],
    abilityScores: { STR: 14, DEX: 18, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
  });

// A Medium PC target (low DEX so the Trip save fails when it does roll).
const buildMediumTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Goblin', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 4, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 5,
  });

// A Huge target via a monster statblock (Hill Giant is Huge).
const buildHugeTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Hill Giant', speciesId: 'human', backgroundId: 'soldier',
    statblockId: 'hill-giant',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 4, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 5,
  });

describe('slice 386: creature-size helper', () => {
  it('a Medium PC is Large-or-smaller; a Huge monster instance is not', () => {
    expect(creatureSize(buildMediumTarget(), CONTENT)).toBe('Medium');
    expect(isLargeOrSmaller(creatureSize(buildMediumTarget(), CONTENT))).toBe(true);
    expect(creatureSize(buildHugeTarget(), CONTENT)).toBe('Huge');
    expect(isLargeOrSmaller(creatureSize(buildHugeTarget(), CONTENT))).toBe(false);
  });
});

const tripAttack = (target: Character) => {
  const rogue = buildRogue();
  for (let seed = 1; seed < 90; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const dagger = makeItemInstance('dagger');
    let campaign: Campaign = engine.createCampaign({ name: 'trip' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id, weaponInstanceId: dagger.id, advantage: 'advantage', cunningStrike: ['trip'],
    }).events as ReadonlyArray<Event>;
    if ((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) return events;
  }
  throw new Error('no hitting seed');
};

describe('slice 386: Cunning Strike Trip size gate', () => {
  it('Trip on a Medium target rolls a DEX save', () => {
    const events = tripAttack(buildMediumTarget());
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(true);
  });

  it('Trip on a Huge target rolls no save and applies no Prone', () => {
    const events = tripAttack(buildHugeTarget());
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });
});

// Positions a Push-mastery attacker adjacent to a target, returns the
// weaponMastery Push events.
const masteryPush = (target: Character): ReadonlyArray<Event> => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const attacker = CharacterSchema.parse({
    id: newCharacterId(), name: 'Bruiser', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 18, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
  });
  const club = makeItemInstance('greatclub'); // Push mastery
  let campaign: Campaign = engine.createCampaign({ name: 'push' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: club },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [attacker.id, target.id] });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId, combatantId: attacker.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 0, y: 0 }, feetTraveled: 0 },
    { id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: enc.encounterId, combatantId: target.id, fromPosition: { x: 0, y: 0 }, toPosition: { x: 5, y: 0 }, feetTraveled: 0 },
  ]);
  return engine.plan.weaponMastery(campaign.state, {
    mastery: 'Push', attackerId: attacker.id, targetId: target.id, weaponInstanceId: club.id,
  }).events as ReadonlyArray<Event>;
};

describe('slice 386: weapon-mastery Push size gate', () => {
  it('Push moves a Medium target but not a Huge one', () => {
    expect(masteryPush(buildMediumTarget()).some((e) => e.type === 'CombatantMoved')).toBe(true);
    expect(masteryPush(buildHugeTarget()).some((e) => e.type === 'CombatantMoved')).toBe(false);
  });
});
