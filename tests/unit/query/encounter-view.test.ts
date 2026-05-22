// Slice 419: encounter / combat-state view model.
//
// buildEncounterView assembles the combat-tracker view: the initiative
// order with each combatant's HP / AC / conditions / per-turn usage, the
// round, and whose turn it is. Tests drive a real encounter through the
// engine (create -> roll initiative -> start -> first turn) so the view is
// asserted against production state.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { buildEncounterView } from '../../../src/query/encounter-view.js';
import { buildFighter, eventId, isoTimestamp, TEST_PACK } from '../../fixtures/index.js';
import { newAppliedConditionId } from '../../../src/ids.js';
import type { Character } from '../../../src/schemas/runtime/character.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const created = (snapshot: Character): CharacterCreatedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'CharacterCreated',
  snapshot,
});

// Two combatants in a fresh (planning) encounter.
const planningEncounter = (b: Character = buildFighter({ name: 'Goblin', hpMax: 7, hpCurrent: 7 })) => {
  const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(7) });
  const a = buildFighter({ name: 'Alyx', STR: 16 });
  let campaign: Campaign = engine.createCampaign({ name: 'fight' });
  campaign = commit(campaign, [created(a), created(b)]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [a.id, b.id] });
  campaign = commit(campaign, enc.events);
  return { engine, campaign, encounterId: enc.encounterId, a, b };
};

const startedEncounter = () => {
  const ctx = planningEncounter();
  let { campaign } = ctx;
  const { engine, encounterId } = ctx;
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId }).events);
  return { engine, campaign, encounterId };
};

describe('slice 419: buildEncounterView', () => {
  it('returns undefined for an unknown encounter id', () => {
    const { engine, campaign } = planningEncounter();
    expect(buildEncounterView(campaign.state, engine.content, 'no-such-encounter')).toBeUndefined();
  });

  it('a planning encounter has no active combatant', () => {
    const { engine, campaign, encounterId } = planningEncounter();
    const view = buildEncounterView(campaign.state, engine.content, encounterId)!;
    expect(view.status).toBe('planning');
    expect(view.activeCombatantId).toBeUndefined();
    expect(view.combatants).toHaveLength(2);
    expect(view.combatants.every((c) => !c.isActive)).toBe(true);
    // Each combatant carries resolved HP + AC.
    expect(view.combatants.every((c) => c.hp.max > 0 && c.ac > 0)).toBe(true);
  });

  it('an active encounter marks exactly one combatant active, in round 1', () => {
    const { engine, campaign, encounterId } = startedEncounter();
    const view = buildEncounterView(campaign.state, engine.content, encounterId)!;
    expect(view.status).toBe('active');
    expect(view.round).toBe(1);
    expect(view.activeCombatantId).toBeDefined();
    const active = view.combatants.filter((c) => c.isActive);
    expect(active).toHaveLength(1);
    expect(active[0]!.combatantId).toBe(view.activeCombatantId);
  });

  it('combatants are in initiative order (descending initiative)', () => {
    const { engine, campaign, encounterId } = startedEncounter();
    const view = buildEncounterView(campaign.state, engine.content, encounterId)!;
    const inits = view.combatants.map((c) => c.initiative);
    expect([...inits].sort((x, y) => y - x)).toEqual(inits);
  });

  it('flags a combatant at 0 HP as defeated', () => {
    const downed = buildFighter({ name: 'Downed', hpMax: 10, hpCurrent: 0 });
    const { engine, campaign, encounterId } = planningEncounter(downed);
    const view = buildEncounterView(campaign.state, engine.content, encounterId)!;
    const entry = view.combatants.find((c) => c.name === 'Downed')!;
    expect(entry.defeated).toBe(true);
    expect(view.combatants.find((c) => c.name === 'Alyx')!.defeated).toBe(false);
  });

  it('surfaces active conditions with their display name', () => {
    const poisoned: Character = {
      ...buildFighter({ name: 'Sick' }),
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'poisoned' }],
    };
    const { engine, campaign, encounterId } = planningEncounter(poisoned);
    const view = buildEncounterView(campaign.state, engine.content, encounterId)!;
    const entry = view.combatants.find((c) => c.name === 'Sick')!;
    expect(entry.conditions).toHaveLength(1);
    expect(entry.conditions[0]!.id).toBe('poisoned');
    expect(entry.conditions[0]!.name.length).toBeGreaterThan(0);
  });
});
