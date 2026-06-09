// Slice 763: reaction affordances — engine.query.availableReactions
// (discovery) + engine.query.reactionsForTrigger (correlation). A consumer
// renders "which reactions can this combatant take?" and, given a trigger
// event, gets ready-to-commit intents it dispatches to the typed planners.
// The fidelity bar: every correlated intent must be ACCEPTED by its planner.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance, loadPhbExtrasTestPack } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { InitiativeRolledEvent } from '../../../src/schemas/events/encounter.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();
const EXTRAS = loadPhbExtrasTestPack();

const base = (overrides: Partial<Character>): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'PC',
    speciesId: 'human',
    backgroundId: 'soldier',
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 12 },
    hp: { current: 30, max: 30, temp: 0 },
    ...overrides,
  });

const arcaneL5 = (prepared: string[]): Character =>
  base({
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    knownSpells: prepared,
    preparedSpells: prepared,
  });
const rogueL5 = (): Character => base({ classes: [{ classId: 'rogue', level: 5, hitDiceRemaining: 5 }] });
const bardL3 = (): Character =>
  base({
    classes: [{ classId: 'bard', level: 3, hitDiceRemaining: 3 }],
    resources: [{ resourceId: 'bardic-inspiration', current: 3, max: 3 }],
  });

interface Setup {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  encounterId: string;
}

// A started encounter (so turnUsage / reactions are tracked). The reactor is
// NOT required to be the active combatant — reactions fire on others' turns.
const setup = (chars: Character[]): Setup => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'reactions' });
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
      rolls: chars.map((c, i) => ({ combatantId: c.id as ULID, d20: 15 - i, modifier: 0, total: 15 - i })),
    } satisfies InitiativeRolledEvent,
  ]);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { engine, campaign, encounterId: enc.encounterId };
};

// Synthetic trigger events (a consumer passes the real ones from the log).
const attackRolledOn = (targetId: string, attackerId: string, total: number, targetAC: number): Event =>
  ({
    id: eventId(), at: isoTimestamp(), type: 'AttackRolled',
    attackerId: attackerId as ULID, targetId: targetId as ULID, weaponInstanceId: eventId() as ULID,
    d20: [total], used: 'none', attackBonus: 0, total, targetAC, hit: total >= targetAC,
    critical: false, attackKind: 'melee',
  }) as unknown as Event;

const damageAppliedTo = (targetId: string, amount: number): Event =>
  ({
    id: eventId(), at: isoTimestamp(), type: 'DamageApplied',
    targetId: targetId as ULID, components: [{ amount, type: 'slashing' }],
  }) as unknown as Event;

// Mark a combatant's reaction as spent this round (sets reactionUsedThisRound).
const spendReaction = (encounterId: string, combatantId: string): Event =>
  ({
    id: eventId(), at: isoTimestamp(), type: 'ActionEconomyConsumed',
    encounterId: encounterId as ULID, combatantId: combatantId as ULID, kind: 'reaction',
  }) as unknown as Event;

const spellCastBy = (casterId: string, spellId: string, slotLevel: number): Event =>
  ({
    id: eventId(), at: isoTimestamp(), type: 'SpellCastDeclared',
    characterId: casterId as ULID, spellId, slotLevel, slotSource: 'standard', targetIds: [], castAsRitual: false,
  }) as unknown as Event;

describe('slice 763: availableReactions (discovery)', () => {
  it('lists the reactions a combatant owns with their trigger kind', () => {
    const wiz = arcaneL5(['shield', 'counterspell']);
    const s = setup([wiz, base({ classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }] })]);
    const opts = s.engine.query.availableReactions(s.campaign.state, s.encounterId, wiz.id);
    const byId = Object.fromEntries(opts.map((o) => [o.id, o]));
    expect(byId['shield']).toMatchObject({ trigger: 'attack-roll', enabled: true });
    expect(byId['counterspell']).toMatchObject({ trigger: 'spell-cast', enabled: true });
  });

  it('a class with no reactions lists nothing', () => {
    const f = base({ classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }] });
    const s = setup([f]);
    expect(s.engine.query.availableReactions(s.campaign.state, s.encounterId, f.id)).toEqual([]);
  });

  it('disabled (reaction-used) once the reaction is spent this round', () => {
    const wiz = arcaneL5(['shield']);
    const s = setup([wiz]);
    s.campaign = commit(s.campaign, [spendReaction(s.encounterId, wiz.id)]);
    expect(
      s.engine.query.availableReactions(s.campaign.state, s.encounterId, wiz.id)[0],
    ).toMatchObject({ id: 'shield', enabled: false, reason: 'reaction-used' });
  });

  it('disabled by a blocking condition (incapacitated)', () => {
    const wiz = arcaneL5(['shield', 'counterspell']);
    const stunned = { ...wiz, appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'incapacitated' }] } as Character;
    const s = setup([stunned]);
    const opts = s.engine.query.availableReactions(s.campaign.state, s.encounterId, stunned.id);
    expect(opts.every((o) => o.enabled === false && o.reason === 'incapacitated')).toBe(true);
  });
});

describe('slice 763: reactionsForTrigger (correlation) — every intent is planner-accepted', () => {
  it('Shield correlates from a hitting AttackRolled, and the planner accepts it', () => {
    const wiz = arcaneL5(['shield']);
    const foe = base({ classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }] });
    const s = setup([wiz, foe]);
    // A hit that +5 AC would flip (total 15, AC 13 → 15 < 13+5).
    const trigger = attackRolledOn(wiz.id, foe.id, 15, 13);
    const reactions = s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, wiz.id, trigger);
    const shield = reactions.find((r) => r.id === 'shield');
    expect(shield, 'Shield not correlated').toBeDefined();
    const intent = shield!.intent;
    if (intent.type !== 'Shield') throw new Error('expected Shield intent');
    const out = s.engine.plan.shield(s.campaign.state, intent);
    expect(out.events.length).toBeGreaterThan(0);
    expect(out.preventedHit).toBe(true);
  });

  it('Cutting Words correlates from an AttackRolled hit, and the planner accepts it', () => {
    const bard = bardL3();
    const foe = base({ classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }] });
    const s = setup([bard, foe]);
    // A marginal hit a Bardic die can flip (total 13, AC 13 → BI reduces below).
    const trigger = attackRolledOn(foe.id, foe.id, 13, 13);
    const reactions = s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, bard.id, trigger);
    const cw = reactions.find((r) => r.id === 'cutting-words');
    expect(cw, 'Cutting Words not correlated').toBeDefined();
    const intent = cw!.intent;
    if (intent.type !== 'CuttingWords') throw new Error('expected CuttingWords');
    expect(() => s.engine.plan.cuttingWords(s.campaign.state, intent)).not.toThrow();
  });

  it('Uncanny Dodge correlates from DamageApplied, and the planner accepts it', () => {
    const rog = rogueL5();
    const s = setup([rog]);
    const reactions = s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, rog.id, damageAppliedTo(rog.id, 12));
    const ud = reactions.find((r) => r.id === 'uncanny-dodge');
    expect(ud).toBeDefined();
    const intent = ud!.intent;
    if (intent.type !== 'UncannyDodge') throw new Error('expected UncannyDodge');
    expect(intent.damageAmount).toBe(12);
    expect(() => s.engine.plan.uncannyDodge(s.campaign.state, intent)).not.toThrow();
  });

  it('Counterspell correlates from an enemy SpellCastDeclared (leveled), planner-accepted', () => {
    const wiz = arcaneL5(['counterspell']); // L5 → has a 3rd-level slot
    const enemy = arcaneL5(['fireball']);
    const s = setup([wiz, enemy]);
    const trigger = spellCastBy(enemy.id, 'fireball', 3);
    const reactions = s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, wiz.id, trigger);
    const cs = reactions.find((r) => r.id === 'counterspell');
    expect(cs).toBeDefined();
    const intent = cs!.intent;
    if (intent.type !== 'Counterspell') throw new Error('expected Counterspell');
    expect(intent.targetCasterId).toBe(enemy.id);
    expect(() => s.engine.plan.counterspell(s.campaign.state, intent)).not.toThrow();
  });

  it('does not correlate Counterspell against a cantrip (slotLevel 0) or your own cast', () => {
    const wiz = arcaneL5(['counterspell']);
    const enemy = arcaneL5(['fire-bolt']);
    const s = setup([wiz, enemy]);
    const cantrip = s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, wiz.id, spellCastBy(enemy.id, 'fire-bolt', 0));
    expect(cantrip.find((r) => r.id === 'counterspell')).toBeUndefined();
    const own = s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, wiz.id, spellCastBy(wiz.id, 'fireball', 3));
    expect(own.find((r) => r.id === 'counterspell')).toBeUndefined();
  });

  it('returns nothing once the reaction is spent', () => {
    const rog = rogueL5();
    const s = setup([rog]);
    s.campaign = commit(s.campaign, [spendReaction(s.encounterId, rog.id)]);
    expect(s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, rog.id, damageAppliedTo(rog.id, 12))).toEqual([]);
  });
});

// Slice 765: Stone's Endurance (planner-faithful via the resolved ancestry)
// and Protection (shield + Fighting Style + positional adjacency).

// Emit the Giant Ancestry choice + its resolution so findGoliathAncestryChoice
// resolves (mirrors the slice-558 planner test).
const seedAncestry = (characterId: string, selected: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId, characterId: characterId as ULID,
      promptKey: 'goliath-giant-ancestry', prompt: 'Choose a Giant Ancestry.',
      options: [
        { id: 'stones-endurance', label: "Stone's Endurance", effects: [] },
        { id: 'clouds-jaunt', label: "Cloud's Jaunt", effects: [] },
      ],
      oneOf: 1,
    } as unknown as ChoiceRequiredEvent,
    { id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId, characterId: characterId as ULID, selectedOptionIds: [selected] } as unknown as ChoiceResolvedEvent,
  ];
};

const goliath = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Goliath', speciesId: 'goliath', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 16, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    resources: [{ resourceId: 'giant-ancestry', current: 2, max: 2 }],
  });

describe("slice 765: Stone's Endurance (planner-faithful via resolved ancestry)", () => {
  it('a Goliath who chose Stone\'s Endurance is offered it on damage; the planner accepts', () => {
    const g = goliath();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign: Campaign = engine.createCampaign({ name: 'se' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: g } satisfies CharacterCreatedEvent,
      ...seedAncestry(g.id, 'stones-endurance'),
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [g.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
    const dmg = { id: eventId(), at: isoTimestamp(), type: 'DamageApplied', targetId: g.id as ULID, components: [{ amount: 12, type: 'slashing' }] } as unknown as Event;
    const reactions = engine.query.reactionsForTrigger(campaign.state, enc.encounterId, g.id, dmg);
    const se = reactions.find((r) => r.id === 'stones-endurance');
    expect(se, "Stone's Endurance not offered to a resolved Goliath").toBeDefined();
    const seIntent = se!.intent;
    if (seIntent.type !== 'StonesEndurance') throw new Error('expected StonesEndurance');
    expect(() => engine.plan.stonesEndurance(campaign.state, seIntent)).not.toThrow();
  });

  it('a Goliath who did NOT resolve the ancestry is NOT offered it (the deferred-bug fix)', () => {
    const g = goliath(); // species + resource, but no ancestry choice resolved
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign: Campaign = engine.createCampaign({ name: 'se' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: g } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [g.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
    const dmg = { id: eventId(), at: isoTimestamp(), type: 'DamageApplied', targetId: g.id as ULID, components: [{ amount: 12, type: 'slashing' }] } as unknown as Event;
    expect(engine.query.reactionsForTrigger(campaign.state, enc.encounterId, g.id, dmg).find((r) => r.id === 'stones-endurance')).toBeUndefined();
    expect(engine.query.availableReactions(campaign.state, enc.encounterId, g.id).find((r) => r.id === 'stones-endurance')).toBeUndefined();
  });
});

describe('slice 765: Protection (shield + Fighting Style + adjacency)', () => {
  const protectionFighter = (name: string, shieldId: string, withStyle: boolean): Character =>
    CharacterSchema.parse({
      id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 28, max: 28, temp: 0 },
      featsTaken: withStyle ? ['fighting-style-protection'] : [],
      inventory: [shieldId],
      equipped: { shield: shieldId, attuned: [] },
    });

  // protectorPos: the protector relative to the attacked ally at (5,0).
  const run = (protectorPos: { x: number; y: number }, withStyle: boolean) => {
    const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(7) });
    const shield = makeItemInstance('shield');
    const protector = protectionFighter('Shielder', shield.id, withStyle);
    const ally = protectionFighter('Ally', makeItemInstance('shield').id, false);
    const attacker = protectionFighter('Foe', makeItemInstance('shield').id, false);
    let campaign: Campaign = engine.createCampaign({ name: 'prot' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: shield } as unknown as Event,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: protector } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, {
      name: 'arena',
      combatants: [
        { characterId: protector.id, position: protectorPos },
        { characterId: ally.id, position: { x: 5, y: 0 } },
        { characterId: attacker.id, position: { x: 100, y: 0 } },
      ],
    });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
    // A normal single-d20 attack on the ally.
    const trigger = {
      id: eventId(), at: isoTimestamp(), type: 'AttackRolled',
      attackerId: attacker.id as ULID, targetId: ally.id as ULID, weaponInstanceId: eventId() as ULID,
      d20: [15], used: 'none', attackBonus: 0, total: 15, targetAC: 13, hit: true, critical: false, attackKind: 'melee',
    } as unknown as Event;
    return { engine, campaign, encounterId: enc.encounterId, protector, trigger };
  };

  it('an adjacent shield-protector with the Fighting Style is offered Protection; the planner accepts', () => {
    const { engine, campaign, encounterId, protector, trigger } = run({ x: 0, y: 0 }, true); // 5 ft from ally
    const reactions = engine.query.reactionsForTrigger(campaign.state, encounterId, protector.id, trigger);
    const prot = reactions.find((r) => r.id === 'protection');
    expect(prot, 'Protection not offered to an adjacent protector').toBeDefined();
    const protIntent = prot!.intent;
    if (protIntent.type !== 'Protection') throw new Error('expected Protection');
    expect(() => engine.plan.protection(campaign.state, protIntent)).not.toThrow();
  });

  it('a protector more than 5 ft from the ally is NOT offered Protection', () => {
    const { engine, campaign, encounterId, protector, trigger } = run({ x: 50, y: 0 }, true); // 45 ft away
    expect(engine.query.reactionsForTrigger(campaign.state, encounterId, protector.id, trigger).find((r) => r.id === 'protection')).toBeUndefined();
  });

  it('a shield-bearer WITHOUT the Fighting Style does not own Protection', () => {
    const { engine, campaign, encounterId, protector, trigger } = run({ x: 0, y: 0 }, false);
    expect(engine.query.availableReactions(campaign.state, encounterId, protector.id).find((r) => r.id === 'protection')).toBeUndefined();
    expect(engine.query.reactionsForTrigger(campaign.state, encounterId, protector.id, trigger).find((r) => r.id === 'protection')).toBeUndefined();
  });
});
