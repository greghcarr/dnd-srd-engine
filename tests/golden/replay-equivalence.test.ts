import { describe, expect, it } from 'vitest';
import { applyAll } from '../../src/engine/apply.js';
import { replay } from '../../src/engine/replay.js';
import { emptyCampaignState } from '../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp } from '../fixtures/index.js';
import type { Event } from '../../src/schemas/events/index.js';

const buildScenarios = (): ReadonlyArray<{ name: string; events: Event[] }> => {
  const scenarios: Array<{ name: string; events: Event[] }> = [];

  {
    const character = buildFighter({ hpMax: 12, hpCurrent: 12 });
    scenarios.push({
      name: 'create + heal + damage',
      events: [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character },
        {
          id: eventId(),
          at: isoTimestamp(10),
          type: 'DamageApplied',
          targetId: character.id,
          components: [{ amount: 5, type: 'fire' }],
        },
        { id: eventId(), at: isoTimestamp(20), type: 'Healed', targetId: character.id, amount: 3 },
      ],
    });
  }

  {
    const character = buildFighter({
      level: 5,
      hpMax: 40,
      hpCurrent: 5,
      hitDiceRemaining: 0,
      exhaustion: 4,
      resources: [{ resourceId: 'second-wind', current: 0, max: 2 }],
    });
    scenarios.push({
      name: 'long rest restoration',
      events: [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character },
        {
          id: eventId(),
          at: isoTimestamp(10),
          type: 'LongRestStarted',
          participantIds: [character.id],
        },
        { id: eventId(), at: isoTimestamp(20), type: 'LongRestEnded' },
      ],
    });
  }

  {
    const character = buildFighter({ hpCurrent: 0 });
    scenarios.push({
      name: 'death saves to stable',
      events: [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character },
        {
          id: eventId(),
          at: isoTimestamp(10),
          type: 'DeathSaveRolled',
          targetId: character.id,
          d20: 15,
          success: true,
          critical: false,
        },
        {
          id: eventId(),
          at: isoTimestamp(20),
          type: 'DeathSaveRolled',
          targetId: character.id,
          d20: 11,
          success: true,
          critical: false,
        },
        {
          id: eventId(),
          at: isoTimestamp(30),
          type: 'DeathSaveRolled',
          targetId: character.id,
          d20: 18,
          success: true,
          critical: false,
        },
      ],
    });
  }

  return scenarios;
};

describe('replay equivalence invariant', () => {
  for (const scenario of buildScenarios()) {
    it(`${scenario.name}: replay(events) === applyAll(events)`, () => {
      const direct = applyAll(emptyCampaignState(), scenario.events);
      const replayed = replay(scenario.events);
      expect(JSON.stringify(replayed)).toBe(JSON.stringify(direct));
    });
  }
});
