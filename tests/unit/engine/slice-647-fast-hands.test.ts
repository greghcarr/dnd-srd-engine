// Slice 647: Rogue Thief subclass L3 Fast Hands.
//
// RAW (SRD 5.2.1 Thief L3): "As a Bonus Action, you can do one of
// the following. Sleight of Hand — Make a Dexterity (Sleight of
// Hand) check to pick a lock or disarm a trap with Thieves' Tools
// or to pick a pocket. Use an Object — Take the Utilize action, or
// take the Magic action to use a magic item that requires that
// action."
//
// planFastHands is a BA-gate marker — it consumes the bonus action
// and emits FastHandsActivated tagged with the chosen mode. The
// consumer chains to the appropriate follow-up planner
// (planAbilityCheck for sleight-of-hand, planUtilize for object
// interaction, planUseItem for magic items). The mechanic this
// audit pins is the gate + the dispatch marker; the chained
// sub-actions are exercised by their own planner tests.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  FastHandsActivatedEvent,
  ActionEconomyConsumedEvent,
} from '../../../src/schemas/events/action-economy.js';

const PACK = loadStarterPack();

const buildThief = (
  level: number = 3,
  subclassId: string = 'thief',
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pickle',
    speciesId: 'halfling',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level, hitDiceRemaining: level, subclassId }],
    abilityScores: { STR: 8, DEX: 16, CON: 12, INT: 12, WIS: 12, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const buildDummy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const startEncounter = (
  thief: Character,
  dummy: Character,
  seed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign = engine.createCampaign({ name: 'fast-hands' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: thief } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
  ]);
  const create = engine.plan.createEncounter(campaign.state, { combatantIds: [thief.id, dummy.id] });
  campaign = commit(campaign, create.events);
  const enc = Object.values(campaign.state.encounters)[0]!;
  const init = engine.plan.rollInitiative(campaign.state, { encounterId: enc.id });
  campaign = commit(campaign, init.events);
  const start = engine.plan.startEncounter(campaign.state, { encounterId: enc.id });
  campaign = commit(campaign, start.events);
  const begin = engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.id });
  campaign = commit(campaign, begin.events);
  return { engine, campaign, encounterId: enc.id };
};

const advanceToThiefTurn = (
  s: { engine: ReturnType<typeof createEngine>; campaign: Campaign; encounterId: string },
  thiefId: string,
): Campaign => {
  let campaign = s.campaign;
  for (let i = 0; i < 4; i += 1) {
    const enc = campaign.state.encounters[s.encounterId]!;
    const active = enc.combatants[enc.activeIndex]!;
    if (active.combatantId === thiefId) return campaign;
    const advance = s.engine.plan.advanceTurn(campaign.state, { encounterId: s.encounterId });
    campaign = commit(campaign, advance.events);
  }
  return campaign;
};

describe('slice 647: Fast Hands', () => {
  it('emits ActionEconomyConsumed (bonusAction) + FastHandsActivated tagged with mode', () => {
    const thief = buildThief(3);
    const dummy = buildDummy();
    const s = startEncounter(thief, dummy);
    const campaign = advanceToThiefTurn(s, thief.id);
    const { events } = s.engine.plan.fastHands(campaign.state, {
      thiefId: thief.id,
      mode: 'sleightOfHand',
    });

    const ba = events.find(
      (e): e is ActionEconomyConsumedEvent =>
        e.type === 'ActionEconomyConsumed' && e.kind === 'bonusAction',
    );
    expect(ba, 'ActionEconomyConsumed bonusAction not emitted').toBeDefined();

    const activated = events.find(
      (e): e is FastHandsActivatedEvent => e.type === 'FastHandsActivated',
    );
    expect(activated, 'FastHandsActivated not emitted').toBeDefined();
    expect(activated!.mode).toBe('sleightOfHand');

    const after = commit(campaign, events);
    const enc = after.state.encounters[s.encounterId]!;
    const cb = enc.combatants.find((c) => c.combatantId === thief.id)!;
    expect(cb.turnUsage.bonusActionUsed, 'BA flag not set after Fast Hands').toBe(true);
  });

  it('accepts all three modes (sleightOfHand, utilize, useMagicItem)', () => {
    for (const mode of ['sleightOfHand', 'utilize', 'useMagicItem'] as const) {
      const thief = buildThief(3);
      const s = startEncounter(thief, buildDummy());
      const campaign = advanceToThiefTurn(s, thief.id);
      const { events } = s.engine.plan.fastHands(campaign.state, {
        thiefId: thief.id,
        mode,
      });
      const activated = events.find(
        (e): e is FastHandsActivatedEvent => e.type === 'FastHandsActivated',
      );
      expect(activated, `mode ${mode}: FastHandsActivated not emitted`).toBeDefined();
      expect(activated!.mode).toBe(mode);
    }
  });

  it('rejects: non-rogue, rogue under L3, rogue without Thief subclass, BA already used', () => {
    // Non-rogue
    const wizard = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Mage',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
      hp: { current: 28, max: 28, temp: 0 },
    });
    const sw = startEncounter(wizard, buildDummy());
    const campaignW = advanceToThiefTurn(sw, wizard.id);
    expect(() =>
      sw.engine.plan.fastHands(campaignW.state, { thiefId: wizard.id, mode: 'sleightOfHand' }),
    ).toThrow(/Fast Hands/);

    // Rogue under L3
    const lowThief = buildThief(2);
    const sl = startEncounter(lowThief, buildDummy());
    const campaignL = advanceToThiefTurn(sl, lowThief.id);
    expect(() =>
      sl.engine.plan.fastHands(campaignL.state, { thiefId: lowThief.id, mode: 'sleightOfHand' }),
    ).toThrow(/Fast Hands/);

    // Rogue without Thief subclass (e.g. some other rogue subclass)
    const otherRogue = buildThief(3, 'arcane-trickster');
    const so = startEncounter(otherRogue, buildDummy());
    const campaignO = advanceToThiefTurn(so, otherRogue.id);
    expect(() =>
      so.engine.plan.fastHands(campaignO.state, { thiefId: otherRogue.id, mode: 'sleightOfHand' }),
    ).toThrow(/Fast Hands/);

    // BA already used
    const thief = buildThief(3);
    const s2 = startEncounter(thief, buildDummy());
    let campaign2 = advanceToThiefTurn(s2, thief.id);
    const first = s2.engine.plan.fastHands(campaign2.state, {
      thiefId: thief.id,
      mode: 'utilize',
    });
    campaign2 = commit(campaign2, first.events);
    expect(() =>
      s2.engine.plan.fastHands(campaign2.state, { thiefId: thief.id, mode: 'sleightOfHand' }),
    ).toThrow(/bonus action/);
  });
});
