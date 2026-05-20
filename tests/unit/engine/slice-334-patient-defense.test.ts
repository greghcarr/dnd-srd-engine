// Slice 334 — Monk's Focus: Patient Defense. As a Bonus Action, take the
// Disengage action; or spend 1 Focus Point to take Disengage + Dodge
// (and, at Monk level 10+, gain temp HP equal to two Martial Arts dice).
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
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildMonk = (level: number, ki: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Lin', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    resources: [{ resourceId: 'ki', current: ki, max: level }],
  });

// Fresh single-combatant encounter with the monk active on their turn.
const setup = (level: number, ki: number): { engine: ReturnType<typeof createEngine>; campaign: Campaign; monkId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
  const monk = buildMonk(level, ki);
  let campaign: Campaign = engine.createCampaign({ name: 'patient-defense' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [monk.id] });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { engine, campaign, monkId: monk.id };
};

describe('slice 334: Patient Defense', () => {
  it('free mode: Disengage as a Bonus Action, no Focus Point spent', () => {
    const s = setup(5, 0); // 0 ki — free mode must still work
    const events = s.engine.plan.patientDefense(s.campaign.state, { monkId: s.monkId }).events;
    expect(events.some((e) => e.type === 'Disengaged')).toBe(true);
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
    const bonus = events.find((e) => e.type === 'ActionEconomyConsumed');
    expect((bonus as { kind: string }).kind).toBe('bonusAction');
  });

  it('focus mode (L5): spends 1 Focus Point, takes Disengage + Dodge, no temp HP', () => {
    const s = setup(5, 3);
    const events = s.engine.plan.patientDefense(s.campaign.state, { monkId: s.monkId, spendFocusPoint: true }).events;
    expect(events.some((e) => e.type === 'Disengaged')).toBe(true);
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(true);
    const cond = events.find((e) => e.type === 'ConditionApplied');
    expect((cond as { conditionId: string }).conditionId).toBe('dodged');
    expect(events.some((e) => e.type === 'TempHPGranted')).toBe(false);
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.monkId]!.resources.find((r) => r.resourceId === 'ki')!.current).toBe(2);
    expect(after.state.characters[s.monkId]!.appliedConditions.some((c) => c.conditionId === 'dodged')).toBe(true);
    expect(JSON.stringify(replay(after.events))).toBe(JSON.stringify(after.state));
    void throwOnCallRNG();
    expect(() => replay(after.events)).not.toThrow();
  });

  it('Heightened Focus (L10): focus mode also grants temp HP from two Martial Arts dice', () => {
    const s = setup(10, 3);
    const events = s.engine.plan.patientDefense(s.campaign.state, { monkId: s.monkId, spendFocusPoint: true }).events;
    const temp = events.find((e) => e.type === 'TempHPGranted');
    expect(temp).toBeDefined();
    // Two rolls of the L10 Martial Arts die (1d8): 2..16.
    const amount = (temp as { amount: number }).amount;
    expect(amount).toBeGreaterThanOrEqual(2);
    expect(amount).toBeLessThanOrEqual(16);
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.monkId]!.hp.temp).toBe(amount);
  });

  it('throws in focus mode with no Focus Points', () => {
    const s = setup(5, 0);
    expect(() =>
      s.engine.plan.patientDefense(s.campaign.state, { monkId: s.monkId, spendFocusPoint: true }),
    ).toThrow(/no Focus Points/);
  });

  it('throws outside an active encounter', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const monk = buildMonk(5, 3);
    let campaign: Campaign = engine.createCampaign({ name: 'no-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.patientDefense(campaign.state, { monkId: monk.id }),
    ).toThrow(/active encounter/);
  });
});
