// Slice 475: Cunning Action - Rogue L2+ + Spy bonus action.
//
// RAW (SRD 5.2.1 Rogue L2): "You can take the Dash, Disengage, or
// Hide action as a Bonus Action."
// RAW (SRD 5.2.1 Spy, CR 1): "Cunning Action. The spy takes the
// Dash, Disengage, or Hide action [as a Bonus Action]."
//
// planCunningAction mirrors planNimbleEscape's body (slice 455) with
// the addition of a dash mode and a dual eligibility gate: any Rogue
// L2+ character OR a monster whose statblockId is on the
// CUNNING_ACTION_STATBLOCKS allowlist (currently {'spy'}).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

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

const buildRogue = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Lyra',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level, hitDiceRemaining: level }],
    abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildFighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Borin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const startEncounter = (
  engine: ReturnType<typeof createEngine>,
  characters: Character[],
): Campaign => {
  let campaign = engine.createCampaign({ name: 'cunning-action' });
  campaign = commit(
    campaign,
    characters.map(
      (c) =>
        ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
    ),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: characters.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe('Cunning Action (slice 475) - Spy', () => {
  it('Dash mode: emits ActionEconomyConsumed(bonusAction) + Dashed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const spy = buildSpy();
    const campaign = startEncounter(engine, [spy]);
    const events = engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'dash' }).events;
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect((events[0] as { kind: string }).kind).toBe('bonusAction');
    expect(events[1]!.type).toBe('Dashed');
  });

  it('Disengage mode: emits bonusAction + Disengaged', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const spy = buildSpy();
    const campaign = startEncounter(engine, [spy]);
    const events = engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'disengage' }).events;
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('Disengaged');
  });

  it('Hide mode (success): emits bonusAction + AbilityCheckRolled + ConditionApplied(invisible)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const spy = buildSpy();
    const campaign = startEncounter(engine, [spy]);
    const events = engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'hide', dc: 1 }).events;
    expect(events.length).toBe(3);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('AbilityCheckRolled');
    expect(events[2]!.type).toBe('ConditionApplied');
    expect((events[2] as { conditionId: string }).conditionId).toBe('invisible');
  });

  it('Hide mode (failure): emits bonusAction + AbilityCheckRolled but no condition', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const spy = buildSpy();
    const campaign = startEncounter(engine, [spy]);
    const events = engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'hide', dc: 99 }).events;
    expect(events.length).toBe(2);
    expect((events[1] as { success: boolean }).success).toBe(false);
  });
});

describe('Cunning Action (slice 475) - Rogue L2+', () => {
  it('Rogue L2 has Cunning Action via the class-enrollment gate', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const rogue = buildRogue(2);
    const campaign = startEncounter(engine, [rogue]);
    const events = engine.plan.cunningAction(campaign.state, { actorId: rogue.id, mode: 'dash' }).events;
    expect(events[1]!.type).toBe('Dashed');
  });

  it('Rogue L5 also has Cunning Action', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const rogue = buildRogue(5);
    const campaign = startEncounter(engine, [rogue]);
    const events = engine.plan.cunningAction(campaign.state, { actorId: rogue.id, mode: 'disengage' }).events;
    expect(events[1]!.type).toBe('Disengaged');
  });

  it('Rogue L1 does NOT yet have Cunning Action (granted at L2)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const rogue = buildRogue(1);
    const campaign = startEncounter(engine, [rogue]);
    expect(() =>
      engine.plan.cunningAction(campaign.state, { actorId: rogue.id, mode: 'dash' }),
    ).toThrow(/does not have Cunning Action/);
  });
});

describe('Cunning Action (slice 475) - rejection paths', () => {
  it('Fighter (no Cunning Action) is rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8) });
    const fighter = buildFighter();
    const campaign = startEncounter(engine, [fighter]);
    expect(() =>
      engine.plan.cunningAction(campaign.state, { actorId: fighter.id, mode: 'dash' }),
    ).toThrow(/does not have Cunning Action/);
  });

  it('out-of-encounter: rejected (Cunning Action needs an active encounter)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(9) });
    const spy = buildSpy();
    let campaign = engine.createCampaign({ name: 'no-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: spy } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'dash' }),
    ).toThrow(/active encounter/);
  });

  it('using Cunning Action twice in one turn is rejected (bonus action already used)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(10) });
    const spy = buildSpy();
    let campaign = startEncounter(engine, [spy]);
    campaign = commit(
      campaign,
      engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'dash' }).events,
    );
    expect(() =>
      engine.plan.cunningAction(campaign.state, { actorId: spy.id, mode: 'disengage' }),
    ).toThrow(/already used their bonus action/);
  });
});

describe('Cunning Action (slice 475) - content wires', () => {
  it('Spy statblock carries the cunning-action Custom marker', () => {
    const spy = PACK.monsters.find((m) => m.id === 'spy');
    expect(spy?.traits).toEqual([{ kind: 'Custom', handlerId: 'cunning-action' }]);
  });

  it('Rogue L2 cunning-action feature ships the cunning-action Custom marker', () => {
    const rogue = PACK.classes.find((c) => c.id === 'rogue');
    const l2 = rogue?.levelTable['2']?.features.find((f) => f.id === 'cunning-action');
    expect(l2?.effects).toEqual([{ kind: 'Custom', handlerId: 'cunning-action' }]);
  });
});
