// Slice 368 - Bestow Curse "inactive turn" arm: forced Dodge (not just lost action).
//
// Bug (logged in the slice-361 sweep): cursed-inert-active modeled the
// 2014 "waste your action" wording via recurringSave { onFail:
// 'consumeAction' }, but SRD 5.2.1 changed the arm to "the target must
// succeed on a Wisdom saving throw at the start of each of its turns or
// be forced to take the Dodge action that turn." Forced Dodge consumes
// the action AND grants Dodge's defensive benefit. Fix: a new recurring
// `onFail: 'dodge'` that, on a failed save, emits ActionEconomyConsumed
// (action) and applies the `dodged` condition (mirroring planDodge);
// cursed-inert-active now uses it.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Hexer', speciesId: 'human', backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 9, hitDiceRemaining: 9 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 50, max: 50, temp: 0 }, preparedSpells: ['bestow-curse'],
  });

const buildLowWisTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Cursed Brute', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 6, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
  });

const ofType = <T extends Event>(events: ReadonlyArray<Event>, type: T['type']) =>
  events.find((e): e is T => e.type === type);

// Casts bestow-curse(inactive-turn) inside an encounter, then ticks the
// recurring save; loops seeds until the curse lands and the recurring
// save fails (so the forced Dodge fires).
const tickUntilForcedDodge = (): { tickEvents: ReadonlyArray<Event>; save: SaveRolledEvent; targetId: string } => {
  for (let seed = 1; seed < 300; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const cleric = buildCleric();
    const target = buildLowWisTarget();
    let campaign: Campaign = engine.createCampaign({ name: `inert-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [cleric.id, target.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'bestow-curse', slotLevel: 3, targetIds: [target.id],
      casterChoice: { kind: 'variant', value: 'inactive-turn' },
    }).events;
    if (!cast.some((e) => e.type === 'ConditionApplied')) continue;
    campaign = commit(campaign, cast);
    const tickEvents = engine.plan.tickRecurringSave(campaign.state, {
      targetId: target.id, conditionId: 'cursed-inert-active',
    }).events as ReadonlyArray<Event>;
    const save = ofType<SaveRolledEvent>(tickEvents, 'SaveRolled');
    if (save?.success !== false) continue;
    return { tickEvents, save, targetId: target.id };
  }
  throw new Error('no seed produced a cursed-inert application + failed recurring save');
};

describe('slice 368: Bestow Curse inactive-turn is forced Dodge', () => {
  it('on a failed recurring save, consumes the action AND applies the dodged condition', () => {
    const { tickEvents, save, targetId } = tickUntilForcedDodge();
    const consumed = ofType<ActionEconomyConsumedEvent>(tickEvents, 'ActionEconomyConsumed');
    const dodged = ofType<ConditionAppliedEvent>(tickEvents, 'ConditionApplied');
    expect(consumed?.kind).toBe('action');
    expect(consumed?.combatantId).toBe(targetId);
    expect(dodged?.conditionId).toBe('dodged');
    expect(dodged?.targetId).toBe(targetId);
    // both caused by the failed recurring save
    expect(consumed?.causedByEventId).toBe(save.id);
    expect(dodged?.causedByEventId).toBe(save.id);
  });
});
