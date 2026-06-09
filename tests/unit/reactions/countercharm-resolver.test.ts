// Slice 752: deterministic correctness gate for the post-commit
// Countercharm resolver. Random fuzz windows are rare (~1% of L7 2v2 PC
// battles), so this constructs the scenario directly — a Bard L7 carrying
// a `charmed` condition from a failed save — and asserts the resolver
// rerolls and, on success, removes the condition (and leaves it on a fail).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { makeAutoReactionPolicy } from '../../../scripts/reactions/reaction-policy.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { newEncounterId } from '../../../src/ids.js';
import { TEST_PACK, buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';

const buildBardL7 = (): Character =>
  CharacterSchema.parse({
    ...buildFighter({ name: 'Lyric', level: 7, hpMax: 50, hpCurrent: 50 }),
    classes: [{ classId: 'bard', level: 7, hitDiceRemaining: 7 }],
  });

// Build a campaign with a Bard L7 in an active encounter, charm them via a
// failed WIS save, run the post-commit reaction policy over those events,
// and return the resulting campaign. `dc` controls the reroll outcome: a
// low DC always clears (Advantage reroll succeeds), a high DC never does.
const runCountercharm = (dc: number): { events: ReadonlyArray<Event>; charmedAfter: boolean } => {
  const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(7) });
  const bard = buildBardL7();
  let campaign = engine.createCampaign({ name: 'countercharm' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard },
  ] as Event[]);
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, name: 't', combatantIds: [bard.id] },
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [{ combatantId: bard.id, d20: 10, modifier: 0, total: 10 }] },
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId },
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: bard.id, round: 1 },
  ] as Event[]);

  const saveEvent = {
    id: eventId(), at: isoTimestamp(), type: 'SaveRolled',
    targetId: bard.id, ability: 'WIS', dc, d20: [3], used: 'none', bonus: 5, total: 8, success: false,
  } as unknown as Event;
  const condEvent = {
    id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId: bard.id, conditionId: 'charmed',
  } as unknown as Event;
  campaign = commit(campaign, [saveEvent, condEvent]);

  const policy = makeAutoReactionPolicy();
  const after = policy({
    engine,
    pack: TEST_PACK,
    campaign,
    encounterId,
    producedEvents: [saveEvent, condEvent],
    combatants: {},
    teamACharacterIds: [bard.id],
    teamBCharacterIds: [],
  });

  const charmedAfter = (after.state.characters[bard.id]?.appliedConditions ?? []).some(
    (c) => c.conditionId === 'charmed',
  );
  return { events: after.events, charmedAfter };
};

describe('Countercharm resolver (slice 752)', () => {
  it('rerolls and removes the condition on a successful reroll', () => {
    const { events, charmedAfter } = runCountercharm(5); // low DC: Advantage always clears
    const reroll = events.find((e) => e.type === 'SaveRolled' && (e as { used?: string }).used === 'advantage');
    expect(reroll, 'no Advantage reroll emitted').toBeDefined();
    expect(events.some((e) => e.type === 'ConditionRemoved' && (e as { conditionId?: string }).conditionId === 'charmed'), 'no ConditionRemoved emitted').toBe(true);
    expect(charmedAfter, 'charmed should be removed on success').toBe(false);
  });

  it('rerolls but leaves the condition when the reroll fails', () => {
    const { events, charmedAfter } = runCountercharm(40); // unreachable DC: reroll fails
    expect(events.some((e) => e.type === 'SaveRolled' && (e as { used?: string }).used === 'advantage'), 'reroll should still happen').toBe(true);
    expect(events.some((e) => e.type === 'ConditionRemoved'), 'no condition should be removed on a failed reroll').toBe(false);
    expect(charmedAfter, 'charmed should remain on a failed reroll').toBe(true);
  });
});
