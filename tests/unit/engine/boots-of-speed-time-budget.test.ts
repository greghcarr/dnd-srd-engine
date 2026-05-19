import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemTimeBudgetConsumedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

// Slice 293. Boots of Speed (rare wondrous, attunement; Toggle-shape
// onUse activating `boots-of-speed-active`). RAW: "When the boots'
// property has been used for a total of 10 minutes, the magic ceases
// to function until you finish a Long Rest." The engine models this
// as a `timeBudget.maxMinutesPerLongRest` slot on the magic-item
// definition (10 min/LR for the boots) plus a `minutesUsed` counter
// on each instance. The consumer reports `minutesElapsed` on the
// toggle-off intent, the planner emits ItemTimeBudgetConsumed, the
// reducer increments the counter, and the next toggle-on rechecks
// the cap. `applyLongRestEnded` resets `minutesUsed` to 0 for all
// participants' inventory.

const PACK = loadStarterPack();
const BOOTS_BUDGET_MIN = 10;

const buildWearer = (bootsId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wearer',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
    inventory: [bootsId],
    equipped: { attuned: [bootsId] },
  });

const seedWearer = () => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(293) });
  let campaign: Campaign = engine.createCampaign({ name: 'boots-tb' });
  const bootsId = newItemInstanceId();
  const wearer = buildWearer(bootsId);
  const boots = makeItemInstance('boots-of-speed', { id: bootsId });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: boots },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: wearer,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, wearerId: wearer.id, bootsId };
};

describe('slice 293: Boots of Speed time-budget cap (10 min per long rest)', () => {
  it('toggle-on under the cap is allowed; toggle-off with minutesElapsed emits ItemTimeBudgetConsumed', () => {
    const { engine, campaign, wearerId, bootsId } = seedWearer();
    const onEvents = engine.plan.useItem(campaign.state, {
      characterId: wearerId,
      instanceId: bootsId,
    }).events;
    let next = commit(campaign, onEvents);
    const offEvents = engine.plan.useItem(next.state, {
      characterId: wearerId,
      instanceId: bootsId,
      minutesElapsed: 4,
    }).events;
    next = commit(next, offEvents);
    const tb = offEvents.find(
      (e): e is ItemTimeBudgetConsumedEvent => e.type === 'ItemTimeBudgetConsumed',
    );
    expect(tb).toBeDefined();
    expect(tb?.amountMinutes).toBe(4);
    expect(next.state.itemInstances[bootsId]?.minutesUsed).toBe(4);
  });

  it('toggle-off without minutesElapsed leaves minutesUsed unchanged', () => {
    const { engine, campaign, wearerId, bootsId } = seedWearer();
    let next = commit(
      campaign,
      engine.plan.useItem(campaign.state, { characterId: wearerId, instanceId: bootsId }).events,
    );
    next = commit(
      next,
      engine.plan.useItem(next.state, { characterId: wearerId, instanceId: bootsId }).events,
    );
    expect(next.state.itemInstances[bootsId]?.minutesUsed).toBeUndefined();
  });

  it('multiple toggle cycles accumulate minutesUsed', () => {
    const { engine, campaign, wearerId, bootsId } = seedWearer();
    let next = campaign;
    for (let i = 0; i < 3; i++) {
      next = commit(
        next,
        engine.plan.useItem(next.state, { characterId: wearerId, instanceId: bootsId }).events,
      );
      next = commit(
        next,
        engine.plan.useItem(next.state, {
          characterId: wearerId,
          instanceId: bootsId,
          minutesElapsed: 3,
        }).events,
      );
    }
    expect(next.state.itemInstances[bootsId]?.minutesUsed).toBe(9);
  });

  it('toggle-on after the cap is exhausted throws (10 min budget consumed)', () => {
    const { engine, campaign, wearerId, bootsId } = seedWearer();
    let next = commit(
      campaign,
      engine.plan.useItem(campaign.state, { characterId: wearerId, instanceId: bootsId }).events,
    );
    next = commit(
      next,
      engine.plan.useItem(next.state, {
        characterId: wearerId,
        instanceId: bootsId,
        minutesElapsed: BOOTS_BUDGET_MIN,
      }).events,
    );
    expect(next.state.itemInstances[bootsId]?.minutesUsed).toBe(BOOTS_BUDGET_MIN);
    expect(() =>
      engine.plan.useItem(next.state, { characterId: wearerId, instanceId: bootsId }),
    ).toThrow(/exhausted/);
  });

  it('long rest resets minutesUsed and re-enables toggle-on', () => {
    const { engine, campaign, wearerId, bootsId } = seedWearer();
    let next = commit(
      campaign,
      engine.plan.useItem(campaign.state, { characterId: wearerId, instanceId: bootsId }).events,
    );
    next = commit(
      next,
      engine.plan.useItem(next.state, {
        characterId: wearerId,
        instanceId: bootsId,
        minutesElapsed: BOOTS_BUDGET_MIN,
      }).events,
    );
    next = commit(
      next,
      engine.plan.longRest(next.state, { participantIds: [wearerId] }).events,
    );
    expect(next.state.itemInstances[bootsId]?.minutesUsed).toBe(0);
    expect(() =>
      engine.plan.useItem(next.state, { characterId: wearerId, instanceId: bootsId }),
    ).not.toThrow();
  });
});
