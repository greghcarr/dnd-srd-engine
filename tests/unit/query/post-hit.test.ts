// Slice 774: post-hit affordances — engine.query.postHitOptions (discovery +
// slot picker, contextual on a just-landed attack) + postHitIntent (option id +
// chosen slot -> PaladinsSmiteIntent). The consumer renders a "you hit — smite?"
// prompt straight from this and runs the built intent through
// engine.plan.paladinsSmite, never reconstructing the feature's wiring.
//
// The fidelity bar (the discipline of this affordance family): every intent the
// query offers must be ACCEPTED by the planner. The Grapple-style tests below
// dispatch the built intent to engine.plan.paladinsSmite and assert no throw.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { postHitIntent } from '../../../src/query/post-hit.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newItemInstanceId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { InitiativeRolledEvent } from '../../../src/schemas/events/encounter.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const paladin = (level = 5, overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aria',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 50, max: 50, temp: 0 },
    ...overrides,
  });

const fighter = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Foe',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    ...overrides,
  });

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
}

const setup = (chars: Character[], activeId: string): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(774) });
  let campaign: Campaign = engine.createCampaign({ name: 'post-hit' });
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

const attack = (
  attackerId: string,
  targetId: string,
  overrides: Partial<AttackRolledEvent> = {},
): AttackRolledEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'AttackRolled',
  attackerId: attackerId as ULID,
  targetId: targetId as ULID,
  weaponInstanceId: newItemInstanceId() as ULID,
  d20: [15],
  used: 'none',
  attackBonus: 6,
  total: 21,
  targetAC: 15,
  hit: true,
  critical: false,
  attackKind: 'melee',
  ...overrides,
});

describe('slice 774: postHitOptions enumeration', () => {
  it("offers Paladin's Smite after a melee hit, enabled, with the available slot levels", () => {
    const pal = paladin();
    const foe = fighter();
    const s = setup([pal, foe], pal.id);
    const opts = s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id));
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ id: 'paladins-smite', enabled: true });
    // An L5 paladin (half-caster) has 1st- and 2nd-level slots.
    expect(opts[0]!.slotLevels).toEqual([1, 2]);
  });

  it('returns [] on a miss, a ranged hit, and a non-paladin attacker', () => {
    const pal = paladin();
    const foe = fighter();
    const s = setup([pal, foe], pal.id);
    expect(s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id, { hit: false }))).toEqual([]);
    expect(s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id, { attackKind: 'ranged' }))).toEqual([]);
    // A fighter's melee hit — no post-hit feature.
    const fs = setup([foe, pal], foe.id);
    expect(fs.engine.query.postHitOptions(fs.campaign.state, fs.encounterId, attack(foe.id, pal.id))).toEqual([]);
  });

  it("disables with 'no-uses' when every Paladin spell slot is spent", () => {
    // 2024 SRD: a Paladin has Spellcasting from L1, so "no slots" is exhaustion,
    // not low level — over-spend every level (clamped to 0 available).
    const pal = paladin(5, { spellSlotsUsed: { '1': 99, '2': 99, '3': 99, '4': 99, '5': 99 } });
    const foe = fighter();
    const s = setup([pal, foe], pal.id);
    const opts = s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id));
    expect(opts[0]).toMatchObject({ id: 'paladins-smite', enabled: false, reason: 'no-uses' });
    expect(opts[0]!.slotLevels).toEqual([]);
  });

  it("disables with 'bonus-action-used' once the Bonus Action is spent", () => {
    const pal = paladin();
    const foe = fighter();
    const s = setup([pal, foe], pal.id);
    s.campaign = commit(s.campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ActionEconomyConsumed', encounterId: s.encounterId as ULID, combatantId: pal.id as ULID, kind: 'bonusAction' } satisfies ActionEconomyConsumedEvent,
    ]);
    expect(s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id))[0])
      .toMatchObject({ enabled: false, reason: 'bonus-action-used' });
  });

  it("disables with 'not-your-turn' for an off-turn hit (no Bonus Action exists, e.g. an Opportunity Attack)", () => {
    const pal = paladin();
    const foe = fighter();
    const s = setup([pal, foe], foe.id); // the foe is active, not the paladin
    expect(s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id))[0])
      .toMatchObject({ enabled: false, reason: 'not-your-turn' });
  });

  it('disables with the blocking-condition id when the paladin is incapacitated', () => {
    const pal = paladin(5, { appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'incapacitated' }] });
    const foe = fighter();
    const s = setup([pal, foe], pal.id);
    expect(s.engine.query.postHitOptions(s.campaign.state, s.encounterId, attack(pal.id, foe.id))[0])
      .toMatchObject({ enabled: false, reason: 'incapacitated' });
  });
});

describe('slice 774: postHitIntent builder + planner fidelity', () => {
  it('builds a PaladinsSmiteIntent the planner accepts (radiant damage on the target)', () => {
    const pal = paladin();
    const foe = fighter();
    const s = setup([pal, foe], pal.id);
    const event = attack(pal.id, foe.id);
    const opt = s.engine.query.postHitOptions(s.campaign.state, s.encounterId, event)[0]!;
    const intent = postHitIntent(opt.id, event, { slotLevel: opt.slotLevels[0]! });
    expect(intent).toMatchObject({
      type: 'PaladinsSmite',
      paladinId: pal.id,
      targetId: foe.id,
      slotLevel: 1,
      triggeringAttackEventId: event.id,
    });
    const { type: _type, ...rest } = intent;
    const result = s.engine.plan.paladinsSmite(s.campaign.state, rest);
    const damage = result.events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
    expect(damage?.source).toBe('paladins-smite');
    expect(damage?.components.some((c) => c.type === 'radiant')).toBe(true);
  });

  it('carries targetIsUndeadOrFiend through to the intent', () => {
    const pal = paladin();
    const foe = fighter();
    const event = attack(pal.id, foe.id);
    expect(postHitIntent('paladins-smite', event, { slotLevel: 2, targetIsUndeadOrFiend: true }))
      .toMatchObject({ slotLevel: 2, targetIsUndeadOrFiend: true });
    // Omitted when not supplied (planner defaults to no bonus).
    expect(postHitIntent('paladins-smite', event, { slotLevel: 1 })).not.toHaveProperty('targetIsUndeadOrFiend');
  });

  it('throws on an unknown option id', () => {
    const event = attack(newCharacterId(), newCharacterId());
    expect(() => postHitIntent('no-such', event, { slotLevel: 1 })).toThrow(/Unknown post-hit option/);
  });
});
