// Slice 109 — turn-end auto-expiry primitive (Blade Ward).
//
// Pieces:
// 1. ConditionSchema gains `autoExpiry?: { afterRounds, trigger }`.
// 2. ConditionApplied event + AppliedCondition runtime carry
//    `expiryTrigger?: 'turnStart' | 'turnEnd'`.
// 3. The cast-spell buff branch reads the condition def's autoExpiry
//    and stamps `expiresOnRound + expiryTrigger` on the emitted event
//    when cast inside an active encounter.
// 4. `planAdvanceTurn` gains a turn-end sweep that lifts conditions
//    with `expiryTrigger: 'turnEnd'` at the end of the source's turn
//    in the target round. The existing turn-start sweep skips
//    turn-end entries so they don't double-fire.
//
// Canonical user: Blade Ward (L0 self-buff, 1 round duration).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: [],
    preparedSpells: ['blade-ward'],
  });

const buildFoe = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Foe',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 11, max: 11, temp: 0 },
    featsTaken: [],
  });

const seedInCombat = (extraSetup?: (engine: ReturnType<typeof createEngine>, campaign: Campaign) => Campaign) => {
  const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
  const wizard = buildWizard();
  const foe = buildFoe();
  let campaign: Campaign = engine.createCampaign({ name: 'blade-ward-expiry' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foe } satisfies CharacterCreatedEvent,
  ]);
  const created = engine.plan.createEncounter(campaign.state, {
    combatantIds: [wizard.id, foe.id],
  });
  campaign = commit(campaign, created.events);
  campaign = commit(
    campaign,
    engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events,
  );
  if (extraSetup) campaign = extraSetup(engine, campaign);
  return { engine, campaign, encounterId: created.encounterId, wizardId: wizard.id, foeId: foe.id };
};

describe('Blade Ward turn-end auto-expiry', () => {
  it('cast inside an encounter stamps expiresOnRound + expiryTrigger:turnEnd on the applied condition', () => {
    const { engine, campaign, wizardId } = seedInCombat();
    const startRound = campaign.state.encounters[Object.keys(campaign.state.encounters)[0]!]!.round;
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizardId,
      spellId: 'blade-ward',
      slotLevel: 0,
      targetIds: [wizardId],
    }).events;
    const applied = events.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied'
        && (e as ConditionAppliedEvent).conditionId === 'blade-warded-active',
    );
    expect(applied).toBeDefined();
    expect(applied!.expiresOnRound).toBe(startRound + 1);
    expect(applied!.expiryTrigger).toBe('turnEnd');
  });

  it('cast outside an active encounter leaves expiry undefined (consumer-managed)', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(2) });
    const wizard = buildWizard();
    let campaign: Campaign = engine.createCampaign({ name: 'blade-ward-no-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'blade-ward',
      slotLevel: 0,
      targetIds: [wizard.id],
    }).events;
    const applied = events.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied'
        && (e as ConditionAppliedEvent).conditionId === 'blade-warded-active',
    );
    expect(applied).toBeDefined();
    expect(applied!.expiresOnRound).toBeUndefined();
    expect(applied!.expiryTrigger).toBeUndefined();
  });

  it('planAdvanceTurn lifts blade-warded-active at the end of the wizard turn in the target round', () => {
    const { engine, campaign, encounterId, wizardId } = seedInCombat();
    // Wizard casts Blade Ward on their first turn. State now carries
    // blade-warded-active with expiresOnRound = startRound + 1.
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: wizardId,
      spellId: 'blade-ward',
      slotLevel: 0,
      targetIds: [wizardId],
    }).events;
    let c = commit(campaign, castEvents);

    // Advance through turns until we hit the wizard's turn-end in the
    // expiry round. Order from initiative may put wizard first or
    // second; we walk until the wizard's turn ends and look for the
    // ConditionRemoved.
    let removed = false;
    for (let step = 0; step < 6 && !removed; step += 1) {
      const events = engine.plan.advanceTurn(c.state, { encounterId }).events;
      if (events.some(
        (e) => e.type === 'ConditionRemoved'
          && e.targetId === wizardId
          && e.conditionId === 'blade-warded-active',
      )) {
        removed = true;
      }
      c = commit(c, events);
    }
    expect(removed).toBe(true);
    expect(
      c.state.characters[wizardId]!.appliedConditions.some(
        (cond) => cond.conditionId === 'blade-warded-active',
      ),
    ).toBe(false);
  });

  it('does not lift at the start of the wizard turn in the expiry round (only at end)', () => {
    // Specifically verify the turn-start sweep does NOT pick up
    // turn-end-keyed conditions. We track every advanceTurn until the
    // first time the wizard's turn STARTS in the expiry round, and
    // confirm no ConditionRemoved is emitted at that boundary.
    const { engine, campaign, encounterId, wizardId } = seedInCombat();
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: wizardId,
      spellId: 'blade-ward',
      slotLevel: 0,
      targetIds: [wizardId],
    }).events;
    let c = commit(campaign, castEvents);
    const startRound = c.state.encounters[encounterId]!.round;

    // Step until the wizard's turn-start fires in startRound + 1.
    for (let step = 0; step < 6; step += 1) {
      const events = engine.plan.advanceTurn(c.state, { encounterId }).events;
      const turnStart = events.find((e) => e.type === 'TurnStarted');
      if (
        turnStart?.type === 'TurnStarted'
        && turnStart.combatantId === wizardId
        && turnStart.round === startRound + 1
      ) {
        // At the boundary where the turn-start sweep runs. There should
        // be no ConditionRemoved(blade-warded-active) here — that's the
        // turn-end sweep's job.
        const removedAtStart = events.find(
          (e) => e.type === 'ConditionRemoved'
            && e.targetId === wizardId
            && e.conditionId === 'blade-warded-active',
        );
        expect(removedAtStart).toBeUndefined();
        // Condition still present.
        const afterCommit = commit(c, events);
        expect(
          afterCommit.state.characters[wizardId]!.appliedConditions.some(
            (cond) => cond.conditionId === 'blade-warded-active',
          ),
        ).toBe(true);
        return;
      }
      c = commit(c, events);
    }
    throw new Error('never reached the wizard turn-start in the expiry round');
  });
});
