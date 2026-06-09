// Slice 764: general 2024 action affordances — engine.query.actionOptions
// (registry-driven discovery) + actionIntent (id -> intent builder). The
// consumer renders an Action menu and drives a chosen option through
// performIntent, never hardcoding which planner each action routes to.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { actionIntent } from '../../../src/query/action-options.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { InitiativeRolledEvent } from '../../../src/schemas/events/encounter.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const fighter = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'PC',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
    ...overrides,
  });

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
}

const setup = (chars: Character[], activeId: string): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'actions' });
  campaign = commit(
    campaign,
    chars.map((c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: chars.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: enc.encounterId as ULID,
      rolls: chars.map((c) => ({ combatantId: c.id as ULID, d20: c.id === activeId ? 20 : 5, modifier: 0, total: c.id === activeId ? 20 : 5 })),
    } satisfies InitiativeRolledEvent,
  ]);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { engine, campaign, encounterId: enc.encounterId };
};

const byId = (s: Setup, id: string) =>
  Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, id).map((o) => [o.id, o]));

const GENERAL_IDS = ['search', 'study', 'influence', 'utilize', 'hide', 'grapple', 'shove', 'help', 'ready'];

describe('slice 764: actionOptions enumeration', () => {
  it('lists the nine general actions, enabled on the actor\'s turn, with target kinds', () => {
    const f = fighter();
    const s = setup([f], f.id);
    const opts = byId(s, f.id);
    for (const id of GENERAL_IDS) expect(opts[id], `${id} missing`).toMatchObject({ enabled: true });
    expect(opts['grapple']!.target).toBe('creature');
    expect(opts['shove']!.target).toBe('creature');
    expect(opts['help']!.target).toBe('creature');
    expect(opts['search']!.target).toBe('none');
  });

  it('not-your-turn for a non-active combatant', () => {
    const a = fighter();
    const b = fighter();
    const s = setup([a, b], b.id); // b active
    expect(byId(s, a.id)['search']).toMatchObject({ enabled: false, reason: 'not-your-turn' });
  });

  it('action-used once the action is spent', () => {
    const f = fighter();
    const s = setup([f], f.id);
    s.campaign = commit(s.campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ActionEconomyConsumed', encounterId: s.encounterId as ULID, combatantId: f.id as ULID, kind: 'action' } satisfies ActionEconomyConsumedEvent,
    ]);
    expect(byId(s, f.id)['grapple']).toMatchObject({ enabled: false, reason: 'action-used' });
  });

  it('blocking condition (incapacitated) disables every action', () => {
    const f = fighter({ appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'incapacitated' }] });
    const s = setup([f], f.id);
    const opts = s.engine.query.actionOptions(s.campaign.state, s.encounterId, f.id);
    expect(opts.every((o) => o.enabled === false && o.reason === 'incapacitated')).toBe(true);
  });
});

describe('slice 764: useActionOption executor + actionIntent builder', () => {
  it('Search: useActionOption routes to the planner and produces events', () => {
    const f = fighter();
    const s = setup([f], f.id);
    const result = s.engine.plan.useActionOption(s.campaign.state, { combatantId: f.id, optionId: 'search' });
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('Grapple: useActionOption with a target is accepted by the planner', () => {
    const f = fighter();
    const foe = fighter();
    const s = setup([f, foe], f.id);
    expect(() =>
      s.engine.plan.useActionOption(s.campaign.state, { combatantId: f.id, optionId: 'grapple', targetId: foe.id }),
    ).not.toThrow();
  });

  it('throws on an unknown id', () => {
    expect(() => actionIntent('no-such', 'x')).toThrow(/Unknown action option/);
  });

  it('throws on missing required params (Grapple targetId, Shove mode, Help target+mode, Ready trigger)', () => {
    expect(() => actionIntent('grapple', 'x')).toThrow(/requires a targetId/);
    expect(() => actionIntent('shove', 'x', { targetId: 'y' })).toThrow(/requires a mode/);
    expect(() => actionIntent('help', 'x', { mode: 'attack' })).toThrow(/requires a targetId/);
    expect(() => actionIntent('ready', 'x')).toThrow(/requires a trigger/);
  });
});

// Slice 769: class-feature actions — Action Surge (inverted economy),
// Divine Spark + Turn Undead (Cleric Channel Divinity).
const fighterWithSurge = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Surger', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    resources: [{ resourceId: 'action-surge', current: 1, max: 1 }],
  });
const cleric = (cd = 2): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Cleric', speciesId: 'human', backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 16, max: 16, temp: 0 },
    resources: [{ resourceId: 'channel-divinity', current: cd, max: 2 }],
  });

const consumeAction = (s: Setup, id: string): Campaign =>
  commit(s.campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ActionEconomyConsumed', encounterId: s.encounterId as ULID, combatantId: id as ULID, kind: 'action' } satisfies ActionEconomyConsumedEvent,
  ]);

describe('slice 769: Action Surge (inverted economy)', () => {
  it('offered to a Fighter and stays enabled after the action is used (it grants one)', () => {
    const f = fighterWithSurge();
    const s = setup([f], f.id);
    const before = Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, f.id).map((o) => [o.id, o]));
    expect(before['action-surge']).toMatchObject({ target: 'none', enabled: true });
    s.campaign = consumeAction(s, f.id);
    const after = Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, f.id).map((o) => [o.id, o]));
    expect(after['action-surge'], 'Action Surge should remain enabled after the action is used').toMatchObject({ enabled: true });
    // The general actions are now action-used.
    expect(after['search']).toMatchObject({ enabled: false, reason: 'action-used' });
    expect(() => s.engine.plan.useActionOption(s.campaign.state, { combatantId: f.id, optionId: 'action-surge' })).not.toThrow();
  });

  it('disabled (no-uses) when the resource is spent', () => {
    const f = fighterWithSurge();
    f.resources[0]!.current = 0;
    const s = setup([f], f.id);
    expect(Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, f.id).map((o) => [o.id, o]))['action-surge'])
      .toMatchObject({ enabled: false, reason: 'no-uses' });
  });

  it('not offered to a non-Fighter', () => {
    const c = cleric();
    const s = setup([c], c.id);
    expect(s.engine.query.actionOptions(s.campaign.state, s.encounterId, c.id).find((o) => o.id === 'action-surge')).toBeUndefined();
  });
});

describe('slice 769: Channel Divinity actions (Divine Spark + Turn Undead)', () => {
  it('Divine Spark offered to a Cleric; useActionOption heals a target', () => {
    const c = cleric();
    const ally = fighter();
    const s = setup([c, ally], c.id);
    expect(Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, c.id).map((o) => [o.id, o]))['divine-spark'])
      .toMatchObject({ target: 'creature', enabled: true });
    expect(() => s.engine.plan.useActionOption(s.campaign.state, { combatantId: c.id, optionId: 'divine-spark', targetId: ally.id, mode: 'heal' })).not.toThrow();
  });

  it('Turn Undead offered to a Cleric; actionIntent requires targetIds', () => {
    const c = cleric();
    const s = setup([c], c.id);
    expect(Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, c.id).map((o) => [o.id, o]))['turn-undead'])
      .toMatchObject({ enabled: true });
    expect(() => actionIntent('turn-undead', c.id)).toThrow(/requires a targetIds/);
    expect(() => s.engine.plan.useActionOption(s.campaign.state, { combatantId: c.id, optionId: 'turn-undead', targetIds: [] })).not.toThrow();
  });

  it('both disabled (no-uses) when Channel Divinity is spent', () => {
    const c = cleric(0);
    const s = setup([c], c.id);
    const byId = Object.fromEntries(s.engine.query.actionOptions(s.campaign.state, s.encounterId, c.id).map((o) => [o.id, o]));
    expect(byId['divine-spark']).toMatchObject({ enabled: false, reason: 'no-uses' });
    expect(byId['turn-undead']).toMatchObject({ enabled: false, reason: 'no-uses' });
  });
});
