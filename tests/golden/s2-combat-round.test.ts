import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../src/rng/throw.js';
import { replay } from '../../src/engine/replay.js';
import {
  TEST_PACK,
  TEST_CONTENT,
  buildFighter,
  eventId,
  isoTimestamp,
  makeItemInstance,
} from '../fixtures/index.js';
import { commit } from '../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import { formatTranscript } from '../transcript.js';

describe('golden: combat round', () => {
  it('two fighters trade blows in a one-round encounter, replays identically', async () => {
    const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(7) });
    const longA = makeItemInstance('longsword');
    const longB = makeItemInstance('longsword');
    const armorA = makeItemInstance('leather-armor');
    const armorB = makeItemInstance('leather-armor');
    const a = buildFighter({ name: 'Alyx', STR: 18, DEX: 14, armorInstanceId: armorA.id });
    const b = buildFighter({ name: 'Borin', STR: 16, DEX: 12, armorInstanceId: armorB.id });

    let campaign = engine.createCampaign({ name: 'duel' });
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ItemAcquired',
        instance: longA,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ItemAcquired',
        instance: longB,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ItemAcquired',
        instance: armorA,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ItemAcquired',
        instance: armorB,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: a,
      } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: b,
      } satisfies CharacterCreatedEvent,
    ]);

    const createEnc = engine.plan.createEncounter(campaign.state, {
      combatantIds: [a.id, b.id],
      at: '2026-01-01T00:00:00.000Z',
    });
    campaign = commit(campaign, createEnc.events);
    campaign = commit(
      campaign,
      engine.plan.rollInitiative(campaign.state, { encounterId: createEnc.encounterId }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.startEncounter(campaign.state, { encounterId: createEnc.encounterId }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.beginFirstTurn(campaign.state, { encounterId: createEnc.encounterId }).events,
    );

    const firstActor = campaign.state.encounters[createEnc.encounterId]?.combatants[0]?.combatantId;
    if (!firstActor) throw new Error('no first actor');
    const otherActor = firstActor === a.id ? b.id : a.id;
    const firstWeapon = firstActor === a.id ? longA.id : longB.id;
    const secondWeapon = otherActor === a.id ? longA.id : longB.id;

    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: firstActor,
        targetId: otherActor,
        weaponInstanceId: firstWeapon,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: createEnc.encounterId }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.attack(campaign.state, {
        attackerId: otherActor,
        targetId: firstActor,
        weaponInstanceId: secondWeapon,
      }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.advanceTurn(campaign.state, { encounterId: createEnc.encounterId }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.endEncounter(campaign.state, {
        encounterId: createEnc.encounterId,
        outcome: 'victory',
      }).events,
    );

    expect(campaign.state.encounters[createEnc.encounterId]?.status).toBe('ended');
    const replayed = replay(campaign.events);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(campaign.state));

    void throwOnCallRNG();
    expect(() => replay(campaign.events)).not.toThrow();

    await expect(
      formatTranscript(campaign.events, TEST_CONTENT, {
        title: 'Two fighters trade blows in a one-round encounter',
      }),
    ).toMatchFileSnapshot('./transcripts/s2-combat-round.transcript.md');
  });
});
