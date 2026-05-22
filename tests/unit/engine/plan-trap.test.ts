import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  TrapArmedEvent,
  TrapTriggeredEvent,
  TrapExpiredEvent,
} from '../../../src/schemas/events/traps.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Trapper',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 9, hitDiceRemaining: 9 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
    preparedSpells: ['glyph-of-warding'],
  });

const buildRanger = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Quiver',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'ranger', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 18, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
    preparedSpells: ['cordon-of-arrows'],
  });

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Doomed Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 8, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: [],
  });

const findEvent = <T extends { type: string }>(
  events: ReadonlyArray<unknown>,
  type: T['type'],
): T | undefined =>
  events.find(
    (e): e is T => typeof e === 'object' && e !== null && (e as { type?: string }).type === type,
  ) as T | undefined;

describe('engine.plan.castSpell + triggerTrap (Glyph of Warding, Explosive Runes)', () => {
  it('emits a TrapArmed with caster-DC and caster-chosen damage type', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const wizard = buildWizard();
    let campaign: Campaign = engine.createCampaign({ name: 'glyph' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);

    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'glyph-of-warding',
      slotLevel: 3,
      targetIds: [],
      casterChoice: { kind: 'damageType', value: 'fire' },
    }).events;
    const armed = findEvent<TrapArmedEvent>(castEvents, 'TrapArmed');
    expect(armed).toBeDefined();
    expect(armed!.label).toBe('Explosive Runes');
    expect(armed!.chargesRemaining).toBe(1);
    expect(armed!.sourceCharacterId).toBe(wizard.id);
    expect(armed!.sourceSpellId).toBe('glyph-of-warding');
    expect(armed!.payload.damageType).toBe('fire');
    expect(armed!.payload.damageDice).toBe('5d8');
    expect(armed!.payload.saveAbility).toBe('DEX');
    // Caster DC: 8 + prof(4) + INT mod(4) = 16.
    expect(armed!.payload.saveDC).toBe(16);
  });

  it('rejects an unallowed damage type', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const wizard = buildWizard();
    let campaign: Campaign = engine.createCampaign({ name: 'glyph-bad' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'glyph-of-warding',
        slotLevel: 3,
        targetIds: [],
        casterChoice: { kind: 'damageType', value: 'force' },
      }),
    ).toThrow(/not in allowed list/);
  });

  it('triggers: rolls save, deals damage, emits TrapTriggered + TrapExpired on the single charge', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(7) });
    const wizard = buildWizard();
    const victim = buildVictim();
    let campaign: Campaign = engine.createCampaign({ name: 'glyph-trigger' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'glyph-of-warding',
      slotLevel: 3,
      targetIds: [],
      casterChoice: { kind: 'damageType', value: 'fire' },
    }).events;
    campaign = commit(campaign, castEvents);
    const armed = findEvent<TrapArmedEvent>(castEvents, 'TrapArmed')!;
    expect(campaign.state.traps[armed.trapId]).toBeDefined();

    const triggerEvents = engine.plan.triggerTrap(campaign.state, {
      trapId: armed.trapId,
      triggeringCharacterId: victim.id,
    }).events;
    const save = findEvent<SaveRolledEvent>(triggerEvents, 'SaveRolled')!;
    expect(save.ability).toBe('DEX');
    expect(save.targetId).toBe(victim.id);
    expect(save.dc).toBe(16);

    const damage = findEvent<DamageAppliedEvent>(triggerEvents, 'DamageApplied');
    expect(damage).toBeDefined();
    expect(damage!.components[0]!.type).toBe('fire');
    expect(damage!.targetId).toBe(victim.id);

    const triggered = findEvent<TrapTriggeredEvent>(triggerEvents, 'TrapTriggered')!;
    expect(triggered.trapId).toBe(armed.trapId);

    const expired = findEvent<TrapExpiredEvent>(triggerEvents, 'TrapExpired')!;
    expect(expired.reason).toBe('chargesExhausted');

    campaign = commit(campaign, triggerEvents);
    expect(campaign.state.traps[armed.trapId]).toBeUndefined();
  });
});

describe('engine.plan.castSpell + triggerTrap (Cordon of Arrows)', () => {
  it('arms with 4 charges at fixed DC 13 piercing', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(2) });
    const ranger = buildRanger();
    let campaign: Campaign = engine.createCampaign({ name: 'cordon' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: ranger.id,
      spellId: 'cordon-of-arrows',
      slotLevel: 2,
      targetIds: [],
    }).events;
    const armed = findEvent<TrapArmedEvent>(castEvents, 'TrapArmed')!;
    expect(armed.label).toBe('Arrow');
    expect(armed.chargesRemaining).toBe(4);
    expect(armed.payload.saveDC).toBe(13);
    expect(armed.payload.damageType).toBe('piercing');
    expect(armed.payload.halfOnSuccess).toBe(false);
  });

  it('decrements charges per trigger and expires on the fourth fire', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(3) });
    const ranger = buildRanger();
    const victim = buildVictim();
    let campaign: Campaign = engine.createCampaign({ name: 'cordon-fire' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: ranger.id,
      spellId: 'cordon-of-arrows',
      slotLevel: 2,
      targetIds: [],
    }).events;
    campaign = commit(campaign, castEvents);
    const armed = findEvent<TrapArmedEvent>(castEvents, 'TrapArmed')!;

    for (let i = 0; i < 4; i += 1) {
      const triggerEvents = engine.plan.triggerTrap(campaign.state, {
        trapId: armed.trapId,
        triggeringCharacterId: victim.id,
      }).events;
      const expired = findEvent<TrapExpiredEvent>(triggerEvents, 'TrapExpired');
      if (i < 3) {
        expect(expired, `tick ${i} should not expire`).toBeUndefined();
      } else {
        expect(expired, `tick ${i} should expire`).toBeDefined();
      }
      campaign = commit(campaign, triggerEvents);
      const remainingCharges = campaign.state.traps[armed.trapId]?.chargesRemaining ?? 0;
      expect(remainingCharges).toBe(Math.max(0, 3 - i));
    }
    expect(campaign.state.traps[armed.trapId]).toBeUndefined();
  });

  it('throws when triggering a trap with no charges', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(4) });
    const ranger = buildRanger();
    const victim = buildVictim();
    let campaign: Campaign = engine.createCampaign({ name: 'cordon-empty' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: ranger.id,
      spellId: 'cordon-of-arrows',
      slotLevel: 2,
      targetIds: [],
    }).events);
    const trapId = Object.keys(campaign.state.traps)[0]!;
    for (let i = 0; i < 4; i += 1) {
      campaign = commit(campaign, engine.plan.triggerTrap(campaign.state, {
        trapId,
        triggeringCharacterId: victim.id,
      }).events);
    }
    expect(() =>
      engine.plan.triggerTrap(campaign.state, {
        trapId,
        triggeringCharacterId: victim.id,
      }),
    ).toThrow(/Unknown trap|no charges/);
  });
});
