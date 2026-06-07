// Slice 714: bonus-action affordances — engine.query.bonusActions
// enumeration + engine.plan.useOption dispatch. The dnd-web duel renders
// a Bonus Actions menu from bonusActions and performs a chosen option by
// id via useOption, never hardcoding which planner each feature routes to.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { SuppliedRollProvider } from '../../../src/rng/roll-provider.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  InitiativeRolledEvent,
} from '../../../src/schemas/events/encounter.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { ConditionAppliedEvent, HealedEvent } from '../../../src/schemas/events/combat.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const base = (overrides: Partial<Character>): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'PC',
    speciesId: 'human',
    backgroundId: 'soldier',
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 12 },
    hp: { current: 10, max: 24, temp: 0 },
    ...overrides,
  });

const fighter = (secondWind = 2): Character =>
  base({
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    resources: [{ resourceId: 'second-wind', current: secondWind, max: 2 }],
  });
const barbarian = (rage = 3): Character =>
  base({
    classes: [{ classId: 'barbarian', level: 3, hitDiceRemaining: 3 }],
    resources: [{ resourceId: 'rage', current: rage, max: 3 }],
  });
const rogue = (): Character =>
  base({ classes: [{ classId: 'rogue', level: 3, hitDiceRemaining: 3 }] });
const monk = (ki = 2): Character =>
  base({
    classes: [{ classId: 'monk', level: 3, hitDiceRemaining: 3 }],
    resources: [{ resourceId: 'ki', current: ki, max: 3 }],
  });
const bard = (insp = 3): Character =>
  base({
    classes: [{ classId: 'bard', level: 3, hitDiceRemaining: 3 }],
    resources: [{ resourceId: 'bardic-inspiration', current: insp, max: 3 }],
  });
const paladin = (pool = 5): Character =>
  base({
    classes: [{ classId: 'paladin', level: 1, hitDiceRemaining: 1 }],
    resources: [{ resourceId: 'lay-on-hands', current: pool, max: 5 }],
  });
const wizard = (): Character =>
  base({ classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }] });
const orc = (rush = 2): Character =>
  base({
    speciesId: 'orc',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    resources: [{ resourceId: 'adrenaline-rush', current: rush, max: 2 }],
  });
const goblin = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Goblin',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'goblin-warrior',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 15, CON: 10, INT: 10, WIS: 8, CHA: 8 },
    hp: { current: 10, max: 10, temp: 0 },
  });

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
}

// Build an encounter with `activeId` winning initiative (so they are the
// active combatant once the first turn begins).
const setup = (chars: Character[], activeId: string): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'ba' });
  campaign = commit(
    campaign,
    chars.map(
      (c) =>
        ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
    ),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: chars.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: enc.encounterId as ULID,
      rolls: chars.map((c) => ({
        combatantId: c.id as ULID,
        d20: c.id === activeId ? 20 : 5,
        modifier: 0,
        total: c.id === activeId ? 20 : 5,
      })),
    } satisfies InitiativeRolledEvent,
  ]);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { engine, campaign, encounterId: enc.encounterId };
};

const consumeBonusAction = (s: Setup, combatantId: string): Campaign =>
  commit(s.campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId: s.encounterId as ULID,
      combatantId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent,
  ]);

const applyPoisoned = (s: Setup, targetId: string): Campaign =>
  commit(s.campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: targetId as ULID,
      conditionId: 'poisoned',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent,
  ]);

// Seed an unarmed-strike item instance into state (Flurry strikes with one).
const acquireFist = (s: Setup): string => {
  const fist = makeItemInstance('unarmed-strike');
  s.campaign = commit(s.campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: fist },
  ]);
  return fist.id;
};

const byId = (s: Setup, combatantId: string) =>
  Object.fromEntries(
    s.engine.query.bonusActions(s.campaign.state, s.encounterId, combatantId).map((o) => [o.id, o]),
  );

describe('slice 714: bonusActions enumeration', () => {
  it('Fighter: Second Wind (self) enabled on its turn', () => {
    const f = fighter();
    const s = setup([f], f.id);
    const opts = byId(s, f.id);
    expect(opts['second-wind']).toEqual({
      id: 'second-wind',
      label: 'Second Wind',
      target: 'self',
      enabled: true,
    });
  });

  it('A class with no bonus-action feature lists nothing', () => {
    const w = wizard();
    const s = setup([w], w.id);
    expect(s.engine.query.bonusActions(s.campaign.state, s.encounterId, w.id)).toEqual([]);
  });

  it('disabled with reason bonus-action-used once the BA is spent', () => {
    const f = fighter();
    const s = setup([f], f.id);
    s.campaign = consumeBonusAction(s, f.id);
    expect(byId(s, f.id)['second-wind']).toMatchObject({ enabled: false, reason: 'bonus-action-used' });
  });

  it('disabled with reason no-uses when the resource is empty', () => {
    const f = fighter(0);
    const s = setup([f], f.id);
    expect(byId(s, f.id)['second-wind']).toMatchObject({ enabled: false, reason: 'no-uses' });
  });

  it('disabled with reason not-your-turn for a non-active combatant', () => {
    const f = fighter();
    const foe = wizard();
    const s = setup([f, foe], foe.id); // foe is active
    expect(byId(s, f.id)['second-wind']).toMatchObject({ enabled: false, reason: 'not-your-turn' });
  });

  it('Rogue: three Cunning Action modes, target none, enabled', () => {
    const r = rogue();
    const s = setup([r], r.id);
    const opts = byId(s, r.id);
    for (const id of ['cunning-action-dash', 'cunning-action-disengage', 'cunning-action-hide']) {
      expect(opts[id]).toMatchObject({ target: 'none', enabled: true });
    }
  });

  it('Monk: free options enabled, focus variants need a Focus Point', () => {
    const m = monk(0); // no ki
    const s = setup([m], m.id);
    const opts = byId(s, m.id);
    expect(opts['patient-defense']).toMatchObject({ enabled: true });
    expect(opts['step-of-the-wind']).toMatchObject({ enabled: true });
    expect(opts['patient-defense-focus']).toMatchObject({ enabled: false, reason: 'no-focus' });
    expect(opts['step-of-the-wind-focus']).toMatchObject({ enabled: false, reason: 'no-focus' });
  });

  it('Bard: Bardic Inspiration targets a creature', () => {
    const b = bard();
    const s = setup([b], b.id);
    expect(byId(s, b.id)['bardic-inspiration']).toMatchObject({ target: 'creature', enabled: true });
  });

  it('Paladin: Cure Poison needs the 5-point cost in the pool', () => {
    const low = paladin(4);
    const lowS = setup([low], low.id);
    expect(byId(lowS, low.id)['lay-on-hands-cure-poison']).toMatchObject({
      enabled: false,
      reason: 'no-uses',
    });
    const p = paladin(5);
    const ok = setup([p], p.id);
    expect(byId(ok, p.id)['lay-on-hands-cure-poison']).toMatchObject({ target: 'creature', enabled: true });
  });

  it('output is deterministically ordered by id', () => {
    const m = monk();
    const s = setup([m], m.id);
    const ids = s.engine.query.bonusActions(s.campaign.state, s.encounterId, m.id).map((o) => o.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('slice 714: useOption dispatch', () => {
  it('second-wind → Healed (+ ResourceSpent + ActionEconomyConsumed)', () => {
    const f = fighter();
    const s = setup([f], f.id);
    const events = s.engine.plan.useOption(s.campaign.state, { combatantId: f.id, optionId: 'second-wind' }).events;
    expect(events.map((e) => e.type)).toEqual(['ActionEconomyConsumed', 'ResourceSpent', 'Healed']);
  });

  it('rage → ConditionApplied(raging)', () => {
    const b = barbarian();
    const s = setup([b], b.id);
    const events = s.engine.plan.useOption(s.campaign.state, { combatantId: b.id, optionId: 'rage' }).events;
    const applied = events.find((e) => e.type === 'ConditionApplied') as ConditionAppliedEvent | undefined;
    expect(applied?.conditionId).toBe('raging');
  });

  it('cunning-action-dash → Dashed', () => {
    const r = rogue();
    const s = setup([r], r.id);
    const events = s.engine.plan.useOption(s.campaign.state, {
      combatantId: r.id,
      optionId: 'cunning-action-dash',
    }).events;
    expect(events.map((e) => e.type)).toContain('Dashed');
  });

  it('patient-defense → Disengaged', () => {
    const m = monk();
    const s = setup([m], m.id);
    const events = s.engine.plan.useOption(s.campaign.state, {
      combatantId: m.id,
      optionId: 'patient-defense',
    }).events;
    expect(events.map((e) => e.type)).toContain('Disengaged');
  });

  it('bardic-inspiration routes targetId to the recipient', () => {
    const b = bard();
    const ally = wizard();
    const s = setup([b, ally], b.id);
    const events = s.engine.plan.useOption(s.campaign.state, {
      combatantId: b.id,
      optionId: 'bardic-inspiration',
      targetId: ally.id,
    }).events;
    const applied = events.find((e) => e.type === 'ConditionApplied') as ConditionAppliedEvent | undefined;
    expect(applied?.targetId).toBe(ally.id);
    expect(applied?.conditionId).toBe('bearing-bardic-inspiration');
  });

  it('lay-on-hands-cure-poison removes Poisoned from the target', () => {
    const p = paladin(5);
    const ally = wizard();
    const s = setup([p, ally], p.id);
    s.campaign = applyPoisoned(s, ally.id);
    const events = s.engine.plan.useOption(s.campaign.state, {
      combatantId: p.id,
      optionId: 'lay-on-hands-cure-poison',
      targetId: ally.id,
    }).events;
    expect(events.map((e) => e.type)).toContain('ConditionRemoved');
  });

  it('throws on an unknown option id', () => {
    const f = fighter();
    const s = setup([f], f.id);
    expect(() =>
      s.engine.plan.useOption(s.campaign.state, { combatantId: f.id, optionId: 'no-such-option' }),
    ).toThrow(/Unknown bonus-action option/);
  });

  it('throws when a creature-target option is missing targetId', () => {
    const b = bard();
    const s = setup([b], b.id);
    expect(() =>
      s.engine.plan.useOption(s.campaign.state, { combatantId: b.id, optionId: 'bardic-inspiration' }),
    ).toThrow(/requires a targetId/);
  });

  it('routes dice through the active RollProvider (manual d10 for Second Wind)', () => {
    const f = fighter(); // Fighter L3 → heals d10 + 3
    const s = setup([f], f.id);
    const SUPPLIED_D10 = 7;
    const events = s.engine.withRollProvider(new SuppliedRollProvider([SUPPLIED_D10]), () =>
      s.engine.plan.useOption(s.campaign.state, { combatantId: f.id, optionId: 'second-wind' }),
    ).events;
    const healed = events.find((e) => e.type === 'Healed') as HealedEvent | undefined;
    expect(healed?.amount).toBe(SUPPLIED_D10 + 3);
  });
});

describe('slice 715: extended bonus-action surface', () => {
  it('Orc: Adrenaline Rush enabled (dash), target none', () => {
    const o = orc();
    const s = setup([o], o.id);
    expect(byId(s, o.id)['adrenaline-rush']).toMatchObject({ target: 'none', enabled: true });
  });

  it('Goblin: Nimble Escape disengage + hide, target none', () => {
    const g = goblin();
    const s = setup([g], g.id);
    const opts = byId(s, g.id);
    expect(opts['nimble-escape-disengage']).toMatchObject({ target: 'none', enabled: true });
    expect(opts['nimble-escape-hide']).toMatchObject({ target: 'none', enabled: true });
  });

  it('Paladin: both Lay on Hands heal and cure-poison, target creature', () => {
    const p = paladin(5);
    const s = setup([p], p.id);
    const opts = byId(s, p.id);
    expect(opts['lay-on-hands-heal']).toMatchObject({ target: 'creature', enabled: true });
    expect(opts['lay-on-hands-cure-poison']).toMatchObject({ target: 'creature', enabled: true });
  });

  it('Monk: Flurry of Blows targets a creature; needs a Focus Point', () => {
    const m = monk(0); // no ki
    const s = setup([m], m.id);
    expect(byId(s, m.id)['flurry-of-blows']).toMatchObject({
      target: 'creature',
      enabled: false,
      reason: 'no-focus',
    });
  });

  it('Frenzy is NOT enumerated (it is a Rage modifier, not a bonus action)', () => {
    const b = barbarian();
    const s = setup([b], b.id);
    expect(byId(s, b.id)['frenzy']).toBeUndefined();
  });

  it('adrenaline-rush → Dashed + TempHPGranted', () => {
    const o = orc();
    const s = setup([o], o.id);
    const types = s.engine.plan
      .useOption(s.campaign.state, { combatantId: o.id, optionId: 'adrenaline-rush' })
      .events.map((e) => e.type);
    expect(types).toContain('Dashed');
    expect(types).toContain('TempHPGranted');
  });

  it('nimble-escape-disengage → Disengaged', () => {
    const g = goblin();
    const s = setup([g], g.id);
    const types = s.engine.plan
      .useOption(s.campaign.state, { combatantId: g.id, optionId: 'nimble-escape-disengage' })
      .events.map((e) => e.type);
    expect(types).toContain('Disengaged');
  });

  it('lay-on-hands-heal routes amount + target to a Healed of that amount', () => {
    const p = paladin(5);
    const ally = wizard();
    const s = setup([p, ally], p.id);
    const HEAL = 3;
    const events = s.engine.plan.useOption(s.campaign.state, {
      combatantId: p.id,
      optionId: 'lay-on-hands-heal',
      targetId: ally.id,
      amount: HEAL,
    }).events;
    const healed = events.find((e) => e.type === 'Healed') as HealedEvent | undefined;
    expect(healed?.targetId).toBe(ally.id);
    expect(healed?.amount).toBe(HEAL);
  });

  it('flurry-of-blows routes target + weapon to Unarmed Strikes', () => {
    const m = monk(2);
    const target = wizard();
    const s = setup([m, target], m.id);
    const fistId = acquireFist(s);
    const types = s.engine.plan
      .useOption(s.campaign.state, {
        combatantId: m.id,
        optionId: 'flurry-of-blows',
        targetId: target.id,
        weaponInstanceId: fistId,
      })
      .events.map((e) => e.type);
    expect(types).toContain('AttackRolled');
  });

  it('throws when lay-on-hands-heal is missing amount', () => {
    const p = paladin(5);
    const ally = wizard();
    const s = setup([p, ally], p.id);
    expect(() =>
      s.engine.plan.useOption(s.campaign.state, {
        combatantId: p.id,
        optionId: 'lay-on-hands-heal',
        targetId: ally.id,
      }),
    ).toThrow(/requires an amount/);
  });

  it('throws when flurry-of-blows is missing weaponInstanceId', () => {
    const m = monk(2);
    const target = wizard();
    const s = setup([m, target], m.id);
    expect(() =>
      s.engine.plan.useOption(s.campaign.state, {
        combatantId: m.id,
        optionId: 'flurry-of-blows',
        targetId: target.id,
      }),
    ).toThrow(/requires a weaponInstanceId/);
  });
});
