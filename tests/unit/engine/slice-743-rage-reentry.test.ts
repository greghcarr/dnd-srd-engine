// Slice 743: a Barbarian can't re-enter Rage while already raging.
//
// Bug (dnd-web duel): a raging Barbarian could take the Rage bonus action
// again next turn, spending another Rage use while already raging. RAW:
// Rage is entered once and persists; you don't re-enter it (or spend a
// second use) until it ends. Scope A here: planRage throws when raging is
// active, and bonusActions surfaces Rage as disabled (reason
// 'already-raging'). Modeling Rage's duration/maintenance is deferred (B).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { InitiativeRolledEvent } from '../../../src/schemas/events/encounter.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const buildBarbarian = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grok',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 38, max: 38, temp: 0 },
    resources: [{ resourceId: 'rage', current: 3, max: 3 }],
  });

const ragingEvent = (id: string): ConditionAppliedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
  targetId: id as ULID, conditionId: 'raging', appliedConditionId: newAppliedConditionId(),
});

describe('slice 743: Rage cannot re-enter while raging — planner', () => {
  it('planRage throws when the Barbarian is already raging', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const barb = buildBarbarian();
    let campaign = engine.createCampaign({ name: 'rage' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: barb } satisfies CharacterCreatedEvent,
      ragingEvent(barb.id),
    ]);
    expect(() => engine.plan.rage(campaign.state, { barbarianId: barb.id })).toThrow(/already raging/i);
  });

  it('planRage succeeds for a non-raging Barbarian with a use left (control)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const barb = buildBarbarian();
    let campaign = engine.createCampaign({ name: 'rage' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: barb } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.rage(campaign.state, { barbarianId: barb.id }).events;
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'raging')).toBe(true);
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(true);
  });
});

const setupEncounter = (chars: Character[]): { engine: ReturnType<typeof createEngine>; campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'rage-enc' });
  campaign = commit(campaign, chars.map(
    (c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
  ));
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: chars.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, [
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: enc.encounterId as ULID,
      rolls: chars.map((c, i) => ({ combatantId: c.id as ULID, d20: i === 0 ? 20 : 5, modifier: 0, total: i === 0 ? 20 : 5 })),
    } satisfies InitiativeRolledEvent,
  ]);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { engine, campaign, encounterId: enc.encounterId };
};

const rageOption = (s: ReturnType<typeof setupEncounter>, id: string) =>
  s.engine.query.bonusActions(s.campaign.state, s.encounterId, id).find((o) => o.id === 'rage');

describe('slice 743: Rage cannot re-enter while raging — bonusActions', () => {
  it('a non-raging Barbarian on its turn is offered Rage (enabled)', () => {
    const barb = buildBarbarian();
    const s = setupEncounter([barb]);
    const rage = rageOption(s, barb.id);
    expect(rage).toBeDefined();
    expect(rage!.enabled).toBe(true);
  });

  it('a raging Barbarian on its turn sees Rage disabled with reason already-raging', () => {
    const barb = buildBarbarian();
    const s = setupEncounter([barb]);
    s.campaign = commit(s.campaign, [ragingEvent(barb.id)]);
    const rage = rageOption(s, barb.id);
    expect(rage).toBeDefined();
    expect(rage!.enabled).toBe(false);
    expect(rage!.reason).toBe('already-raging');
  });
});
