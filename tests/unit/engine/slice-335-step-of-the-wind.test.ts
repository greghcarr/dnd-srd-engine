// Slice 335 — Monk's Focus: Step of the Wind (the last of the trio;
// closes Heightened Focus). As a Bonus Action, take the Dash action; or
// spend 1 Focus Point to take both Disengage and Dash. Jump-doubling and
// the L10 ally-move are consumer-managed (no jump/position model).
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

const setup = (level: number, ki: number): { engine: ReturnType<typeof createEngine>; campaign: Campaign; monkId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
  const monk = buildMonk(level, ki);
  let campaign: Campaign = engine.createCampaign({ name: 'step-of-the-wind' });
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

describe('slice 335: Step of the Wind', () => {
  it('free mode: Dash as a Bonus Action, no Focus Point spent and no Disengage', () => {
    const s = setup(5, 0);
    const events = s.engine.plan.stepOfTheWind(s.campaign.state, { monkId: s.monkId }).events;
    expect(events.some((e) => e.type === 'Dashed')).toBe(true);
    expect(events.some((e) => e.type === 'Disengaged')).toBe(false);
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(false);
    const bonus = events.find((e) => e.type === 'ActionEconomyConsumed');
    expect((bonus as { kind: string }).kind).toBe('bonusAction');
    // Dashing doubles the movement budget in state.
    const after = commit(s.campaign, events);
    const enc = after.state.encounters[after.state.activeEncounterId!]!;
    expect(enc.combatants.find((c) => c.combatantId === s.monkId)!.turnUsage.dashed).toBe(true);
  });

  it('focus mode: spends 1 Focus Point, takes both Disengage and Dash', () => {
    const s = setup(5, 3);
    const events = s.engine.plan.stepOfTheWind(s.campaign.state, { monkId: s.monkId, spendFocusPoint: true }).events;
    expect(events.some((e) => e.type === 'Dashed')).toBe(true);
    expect(events.some((e) => e.type === 'Disengaged')).toBe(true);
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(true);
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.monkId]!.resources.find((r) => r.resourceId === 'ki')!.current).toBe(2);
    const enc = after.state.encounters[after.state.activeEncounterId!]!;
    const usage = enc.combatants.find((c) => c.combatantId === s.monkId)!.turnUsage;
    expect(usage.dashed).toBe(true);
    expect(usage.disengaged).toBe(true);
    expect(JSON.stringify(replay(after.events))).toBe(JSON.stringify(after.state));
    void throwOnCallRNG();
    expect(() => replay(after.events)).not.toThrow();
  });

  it('throws in focus mode with no Focus Points', () => {
    const s = setup(5, 0);
    expect(() =>
      s.engine.plan.stepOfTheWind(s.campaign.state, { monkId: s.monkId, spendFocusPoint: true }),
    ).toThrow(/no Focus Points/);
  });

  it('throws outside an active encounter', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const monk = buildMonk(5, 3);
    let campaign: Campaign = engine.createCampaign({ name: 'no-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    ]);
    expect(() => engine.plan.stepOfTheWind(campaign.state, { monkId: monk.id })).toThrow(/active encounter/);
  });
});
