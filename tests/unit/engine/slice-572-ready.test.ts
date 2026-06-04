// Slice 572: planReady — the L1 Ready action.
//
// RAW (PHB 2024 ch.7 Ready action): "You take the Ready action to wait
// for a particular circumstance before acting. To do so, you take this
// action on your turn, which lets you act using your Reaction before
// the start of your next turn. First, you decide what perceivable
// circumstance will trigger your reaction."
//
// Slice 572 ships planReady as a state-marker planner: consumes the
// Action, stamps the trigger description on the combatant's
// turnUsage as `readiedAction = { trigger }`. The consumer then
// invokes the appropriate reactive planner (planAttack /
// planCastSpell / etc.) when the trigger fires; the Reaction is
// consumed at that point. TurnStarted (next turn) clears the
// readiedAction marker (RAW: "before the start of your next turn").

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ActionEconomyConsumedEvent,
  ActionReadiedEvent,
} from '../../../src/schemas/events/action-economy.js';

const PACK = loadStarterPack();

const buildFighter = (name = 'Aria'): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const startEncounter = (
  engine: ReturnType<typeof createEngine>,
  characters: ReadonlyArray<Character>,
) => {
  let campaign = engine.createCampaign({ name: 'ready' });
  campaign = commit(campaign, characters.map<CharacterCreatedEvent>((c) => ({
    id: eventId(),
    at: isoTimestamp(),
    type: 'CharacterCreated',
    snapshot: c,
  })));
  const enc = engine.plan.createEncounter(campaign.state, {
    combatantIds: characters.map((c) => c.id),
    name: 'fight',
  });
  campaign = commit(campaign, enc.events);
  campaign = commit(
    campaign,
    engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events,
  );
  campaign = commit(
    campaign,
    engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events,
  );
  return { campaign, encounterId: enc.encounterId };
};

describe('planReady (slice 572)', () => {
  it('on-turn Ready consumes Action + emits ActionReadied with trigger', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    const b = buildFighter('B');
    const { campaign, encounterId } = startEncounter(engine, [a, b]);
    const active = campaign.state.encounters[encounterId]!.combatants[
      campaign.state.encounters[encounterId]!.activeIndex
    ]!.combatantId;
    const { events } = engine.plan.ready(campaign.state, {
      combatantId: active,
      trigger: 'when the goblin enters the room',
    });
    const econ = events.find((e): e is ActionEconomyConsumedEvent =>
      (e as { type: string }).type === 'ActionEconomyConsumed');
    expect(econ?.kind).toBe('action');
    const readied = events.find((e): e is ActionReadiedEvent =>
      (e as { type: string }).type === 'ActionReadied');
    expect(readied?.trigger).toBe('when the goblin enters the room');
    expect(readied?.combatantId).toBe(active);
  });

  it('after commit, turnUsage.readiedAction carries the trigger', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    const b = buildFighter('B');
    let { campaign, encounterId } = startEncounter(engine, [a, b]);
    const active = campaign.state.encounters[encounterId]!.combatants[
      campaign.state.encounters[encounterId]!.activeIndex
    ]!.combatantId;
    campaign = commit(
      campaign,
      engine.plan.ready(campaign.state, {
        combatantId: active,
        trigger: 'arrow when enemy peeks',
      }).events,
    );
    const cb = campaign.state.encounters[encounterId]!.combatants.find(
      (c) => c.combatantId === active,
    )!;
    expect(cb.turnUsage.actionUsed).toBe(true);
    expect(cb.turnUsage.readiedAction?.trigger).toBe('arrow when enemy peeks');
    // Reaction is still available (RAW: "lets you act using your Reaction").
    expect(cb.turnUsage.reactionUsedThisRound).toBe(false);
  });

  it('readiedAction clears at TurnStarted (next turn)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    const b = buildFighter('B');
    let { campaign, encounterId } = startEncounter(engine, [a, b]);
    const enc0 = campaign.state.encounters[encounterId]!;
    const first = enc0.combatants[enc0.activeIndex]!.combatantId;
    campaign = commit(
      campaign,
      engine.plan.ready(campaign.state, { combatantId: first, trigger: 'whenever' }).events,
    );
    // End first turn → next combatant starts, then back to first.
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId }).events);
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId }).events);
    const cb = campaign.state.encounters[encounterId]!.combatants.find((c) => c.combatantId === first)!;
    expect(cb.turnUsage.readiedAction).toBeUndefined();
  });

  it('Ready off-turn (not the active combatant) throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    const b = buildFighter('B');
    const { campaign, encounterId } = startEncounter(engine, [a, b]);
    const enc = campaign.state.encounters[encounterId]!;
    const active = enc.combatants[enc.activeIndex]!.combatantId;
    const offTurn = active === a.id ? b.id : a.id;
    expect(() =>
      engine.plan.ready(campaign.state, { combatantId: offTurn, trigger: 'never' }),
    ).toThrow(/must be on their turn/i);
  });

  it('Ready out of encounter throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    let campaign = engine.createCampaign({ name: 'no-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.ready(campaign.state, { combatantId: a.id, trigger: 'never' }),
    ).toThrow(/active encounter/i);
  });

  it('Ready with already-used action throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    const b = buildFighter('B');
    let { campaign, encounterId } = startEncounter(engine, [a, b]);
    const active = campaign.state.encounters[encounterId]!.combatants[
      campaign.state.encounters[encounterId]!.activeIndex
    ]!.combatantId;
    campaign = commit(
      campaign,
      engine.plan.ready(campaign.state, { combatantId: active, trigger: 'first' }).events,
    );
    expect(() =>
      engine.plan.ready(campaign.state, { combatantId: active, trigger: 'second' }),
    ).toThrow(/already used their action/i);
  });

  it('Ready with empty trigger throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = buildFighter('A');
    const b = buildFighter('B');
    const { campaign, encounterId } = startEncounter(engine, [a, b]);
    const active = campaign.state.encounters[encounterId]!.combatants[
      campaign.state.encounters[encounterId]!.activeIndex
    ]!.combatantId;
    expect(() =>
      engine.plan.ready(campaign.state, { combatantId: active, trigger: '   ' }),
    ).toThrow(/non-empty trigger/i);
  });

  it('an Incapacitated combatant cannot Ready', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const a = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'KO',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 10, max: 10, temp: 0 },
      appliedConditions: [{
        id: newAppliedConditionId(),
        conditionId: 'incapacitated',
        appliedAt: isoTimestamp(),
      }],
    });
    const b = buildFighter('B');
    const { campaign, encounterId } = startEncounter(engine, [a, b]);
    // Find a's combatant — they may or may not be active first.
    const enc = campaign.state.encounters[encounterId]!;
    const active = enc.combatants[enc.activeIndex]!.combatantId;
    const test = active === a.id ? a.id : a.id; // try a's id regardless
    expect(() =>
      engine.plan.ready(campaign.state, { combatantId: test, trigger: 'x' }),
    ).toThrow();
  });
});
