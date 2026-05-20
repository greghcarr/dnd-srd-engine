// Slice 323 — CreatureDestroyed reducer. Instant death that bypasses
// the death-save sequence: HP -> 0, death-save failures -> kill
// threshold, and a destroyed concentrator drops its effect.
import { describe, expect, it } from 'vitest';
import { apply } from '../../../src/engine/apply.js';
import { emptyCampaignState } from '../../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { CreatureDestroyedEvent } from '../../../src/schemas/events/combat.js';

const DEATH_SAVE_FAILURES_TO_DIE = 3;

const seed = () => {
  const slayer = buildFighter({ name: 'Slayer' });
  const victim = buildFighter({ name: 'Victim', hpCurrent: 18, hpMax: 40 });
  let state = apply(emptyCampaignState(), {
    id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: slayer,
  } satisfies CharacterCreatedEvent);
  state = apply(state, {
    id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim,
  } satisfies CharacterCreatedEvent);
  return { state, slayerId: slayer.id, victimId: victim.id };
};

describe('CreatureDestroyed reducer', () => {
  it('zeroes HP and sets death-save failures to the kill threshold', () => {
    const { state, slayerId, victimId } = seed();
    const next = apply(state, {
      id: eventId(), at: isoTimestamp(), type: 'CreatureDestroyed',
      targetId: victimId, sourceCharacterId: slayerId,
    } satisfies CreatureDestroyedEvent);
    const victim = next.characters[victimId]!;
    expect(victim.hp.current).toBe(0);
    expect(victim.deathSaves.failures).toBe(DEATH_SAVE_FAILURES_TO_DIE);
    expect(victim.deathSaves.successes).toBe(0);
    expect(victim.deathSaves.stable).toBe(false);
  });

  it('does not require a sourceCharacterId', () => {
    const { state, victimId } = seed();
    const next = apply(state, {
      id: eventId(), at: isoTimestamp(), type: 'CreatureDestroyed', targetId: victimId,
    } satisfies CreatureDestroyedEvent);
    expect(next.characters[victimId]!.deathSaves.failures).toBe(DEATH_SAVE_FAILURES_TO_DIE);
  });
});
