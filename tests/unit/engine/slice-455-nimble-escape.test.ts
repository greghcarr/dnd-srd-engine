// Slice 455: Goblin Nimble Escape monster bonus action.
//
// RAW (SRD 5.2.1 Goblin Warrior / Minion / Boss): "Nimble Escape. The
// goblin takes the Disengage or Hide action [as a Bonus Action]." At-
// will. Both modes consume the goblin's Bonus Action.
//
// planNimbleEscape mirrors planDisengage / planHide's body but routes
// through the Bonus Action economy slot.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const buildGoblin = (statblockId: 'goblin-warrior' | 'goblin-minion' | 'goblin-boss'): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: statblockId,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 15, CON: 10, INT: 10, WIS: 8, CHA: 8 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alex',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const startEncounter = (
  engine: ReturnType<typeof createEngine>,
  characters: Character[],
): Campaign => {
  let campaign = engine.createCampaign({ name: 'nimble-escape' });
  campaign = commit(
    campaign,
    characters.map(
      (c) =>
        ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
    ),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: characters.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe('Goblin Nimble Escape (slice 455)', () => {
  it('Disengage mode: emits ActionEconomyConsumed(bonusAction) + Disengaged', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const goblin = buildGoblin('goblin-warrior');
    const campaign = startEncounter(engine, [goblin]);
    const events = engine.plan.nimbleEscape(campaign.state, { goblinId: goblin.id, mode: 'disengage' }).events;
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect((events[0] as { kind: string }).kind).toBe('bonusAction');
    expect(events[1]!.type).toBe('Disengaged');
  });

  it('Hide mode (success): emits bonusAction + AbilityCheckRolled + ConditionApplied(invisible)', () => {
    // DC 1 forces success regardless of roll.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const goblin = buildGoblin('goblin-warrior');
    const campaign = startEncounter(engine, [goblin]);
    const events = engine.plan.nimbleEscape(campaign.state, { goblinId: goblin.id, mode: 'hide', dc: 1 }).events;
    expect(events.length).toBe(3);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('AbilityCheckRolled');
    expect(events[2]!.type).toBe('ConditionApplied');
    expect((events[2] as { conditionId: string }).conditionId).toBe('invisible');
  });

  it('Hide mode (failure): emits bonusAction + AbilityCheckRolled but no ConditionApplied', () => {
    // DC 99 forces failure.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const goblin = buildGoblin('goblin-warrior');
    const campaign = startEncounter(engine, [goblin]);
    const events = engine.plan.nimbleEscape(campaign.state, { goblinId: goblin.id, mode: 'hide', dc: 99 }).events;
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('AbilityCheckRolled');
    expect((events[1] as { success: boolean }).success).toBe(false);
  });

  it('Goblin Minion + Goblin Boss both accepted', () => {
    for (const id of ['goblin-minion', 'goblin-boss'] as const) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
      const goblin = buildGoblin(id);
      const campaign = startEncounter(engine, [goblin]);
      const events = engine.plan.nimbleEscape(campaign.state, { goblinId: goblin.id, mode: 'disengage' }).events;
      expect(events[1]!.type).toBe('Disengaged');
    }
  });

  it('non-goblin rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const human = buildHuman();
    const campaign = startEncounter(engine, [human]);
    expect(() => engine.plan.nimbleEscape(campaign.state, { goblinId: human.id, mode: 'disengage' }))
      .toThrow(/does not have Nimble Escape/);
  });

  it('rejects when bonus action already used (consecutive calls)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const goblin = buildGoblin('goblin-warrior');
    let campaign = startEncounter(engine, [goblin]);
    const first = engine.plan.nimbleEscape(campaign.state, { goblinId: goblin.id, mode: 'disengage' }).events;
    campaign = commit(campaign, first);
    expect(() => engine.plan.nimbleEscape(campaign.state, { goblinId: goblin.id, mode: 'hide', dc: 1 }))
      .toThrow(/already used their bonus action|already disengaged/);
  });
});
