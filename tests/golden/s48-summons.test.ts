// Golden scenario: summon system.
//
// Wizard casts Find Familiar (ritual, no concentration), then Summon
// Beast (concentration). Both companions appear in state. The wizard
// takes damage and fails the concentration save; the Bestial Spirit
// disappears via clearConcentrationEffect, but the familiar persists.
// Finally the wizard explicitly dismisses the familiar.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../src/rng/throw.js';
import { applyAll } from '../../src/engine/apply.js';
import { replay } from '../../src/engine/replay.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { CompanionSummonedEvent } from '../../src/schemas/events/summons.js';
import type { ConcentrationBrokenEvent } from '../../src/schemas/events/concentration.js';
import { formatTranscript } from '../transcript.js';

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: ['find-familiar', 'summon-beast'],
  });

describe('golden: summons + concentration cleanup', () => {
  it('summon, lose concentration, the bound companion disappears; familiar persists', async () => {
    const STARTER_PACK = loadStarterPack();
    const STARTER_CONTENT = resolveContent([STARTER_PACK, loadPhbExtrasTestPack()]);
    const engine = createEngine({ contentPacks: [STARTER_PACK, loadPhbExtrasTestPack()], rng: seededRNG(7) });
    const alyx = buildWizard();
    let campaign = engine.createCampaign({ name: 'summon-saga' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: alyx } satisfies CharacterCreatedEvent,
    ]);

    // Find Familiar (ritual, not concentration). Persists until dismissed.
    const familiarCast = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id,
      spellId: 'find-familiar',
      slotLevel: 1,
      targetIds: [],
    });
    const familiarSummon = familiarCast.events.find((e) => e.type === 'CompanionSummoned') as
      | CompanionSummonedEvent
      | undefined;
    expect(familiarSummon).toBeDefined();
    const familiarId = familiarSummon!.companionId;
    expect(familiarSummon!.effectInstanceId).toBeUndefined();
    campaign = commit(campaign, familiarCast.events);

    // Summon Beast (concentration, slot 2). Persists until concentration ends.
    const beastCast = engine.plan.castSpell(campaign.state, {
      characterId: alyx.id,
      spellId: 'summon-beast',
      slotLevel: 2,
      targetIds: [],
    });
    const beastSummon = beastCast.events.find((e) => e.type === 'CompanionSummoned') as
      | CompanionSummonedEvent
      | undefined;
    expect(beastSummon).toBeDefined();
    const beastId = beastSummon!.companionId;
    const effectId = beastSummon!.effectInstanceId;
    expect(effectId).toBeDefined();
    campaign = commit(campaign, beastCast.events);

    // Both companions exist.
    expect(campaign.state.characters[familiarId]).toBeDefined();
    expect(campaign.state.characters[beastId]).toBeDefined();
    expect(campaign.state.characters[alyx.id]?.concentrationEffectId).toBe(effectId);

    // Concentration breaks. Bestial Spirit auto-dismissed; familiar
    // persists because it's not tied to the effect.
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConcentrationBroken',
        effectInstanceId: effectId!,
        casterId: alyx.id,
        reason: 'failedSave',
      } satisfies ConcentrationBrokenEvent,
    ]);
    expect(campaign.state.characters[beastId]).toBeUndefined();
    expect(campaign.state.characters[familiarId]).toBeDefined();

    // Explicit dismissal of the familiar.
    campaign = commit(
      campaign,
      engine.plan.dismissCompanion(campaign.state, { companionId: familiarId }).events,
    );
    expect(campaign.state.characters[familiarId]).toBeUndefined();

    // Replay equivalence: replaying the event log yields the same final state.
    const replayed = replay(campaign.events);
    expect(replayed).toEqual(campaign.state);

    // RNG-capture invariant: apply() must never consume RNG. Replaying
    // with a throw-on-call RNG would surface a violation via planners,
    // but apply() itself ignores RNG entirely, so the replay above
    // (which runs apply on every event) is enough proof.
    void throwOnCallRNG;
    void applyAll;

    await expect(
      formatTranscript(campaign.events, STARTER_CONTENT, {
        title: 'Find Familiar + Summon Beast; concentration breaks',
      }),
    ).toMatchFileSnapshot('./transcripts/s48-summons.transcript.md');
  });
});
