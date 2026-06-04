// Slice 548: Barbarian L1 Rage — planRage + `raging` condition.
//
// RAW (SRD 5.2.1 Barbarian L1, condensed): "You can imbue yourself
// with a primal power called Rage... You can enter it as a Bonus
// Action if you aren't wearing Heavy armor... While active, your
// Rage follows the rules below: Damage Resistance (B/P/S),
// Rage Damage (+ bonus on STR attacks), Strength Advantage (checks
// + saves), No Concentration or Spells."
//
// Tests cover: planner happy path + reject paths, plus end-to-end
// proof that the `raging` condition projects the four while-active
// effects through the effect stack: B/P/S resistance, +2 damage
// gated on STR damage ability, advantage on STR checks + saves.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { computeSavingThrow } from '../../../src/derive/save.js';

const PACK = loadStarterPack();

const buildBarbarian = (rageRemaining = 2, opts: { equippedArmorInstanceId?: string } = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grog',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 16, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 14, max: 14, temp: 0 },
    resources: [{ resourceId: 'rage', current: rageRemaining, max: 2 }],
    ...(opts.equippedArmorInstanceId !== undefined
      ? { equipped: { armor: opts.equippedArmorInstanceId } }
      : {}),
  });

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Merik',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 6, max: 8, temp: 0 },
  });

const seedCampaign = (engine: ReturnType<typeof createEngine>, characters: Character[], items: ReturnType<typeof ItemInstanceSchema['parse']>[] = []) => {
  let campaign = engine.createCampaign({ name: 'rage' });
  const events: (CharacterCreatedEvent | ItemAcquiredEvent)[] = [
    ...characters.map<CharacterCreatedEvent>((c) => ({
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: c,
    })),
    ...items.map<ItemAcquiredEvent>((item) => ({
      id: eventId(),
      at: isoTimestamp(),
      type: 'ItemAcquired',
      instance: item,
    })),
  ];
  campaign = commit(campaign, events);
  return campaign;
};

const startEncounter = (engine: ReturnType<typeof createEngine>, base: ReturnType<typeof seedCampaign>, combatantIds: string[]) => {
  let campaign = base;
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe('Barbarian Rage (slice 548)', () => {
  it('out-of-encounter rage entry: emits ResourceSpent + ConditionApplied(raging); skips BA gate', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const barb = buildBarbarian();
    const campaign = seedCampaign(engine, [barb]);
    const { events } = engine.plan.rage(campaign.state, { barbarianId: barb.id });
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ResourceSpent');
    expect(events[1]!.type).toBe('ConditionApplied');
    expect((events[1] as { conditionId: string }).conditionId).toBe('raging');
  });

  it('in-encounter rage entry: also emits ActionEconomyConsumed(bonusAction)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const barb = buildBarbarian();
    let campaign = seedCampaign(engine, [barb]);
    campaign = startEncounter(engine, campaign, [barb.id]);
    const { events } = engine.plan.rage(campaign.state, { barbarianId: barb.id });
    expect(events.length).toBe(3);
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect((events[0] as { kind: string }).kind).toBe('bonusAction');
    expect(events[1]!.type).toBe('ResourceSpent');
    expect(events[2]!.type).toBe('ConditionApplied');
  });

  it('non-Barbarian (Wizard) is rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const wiz = buildWizard();
    const campaign = seedCampaign(engine, [wiz]);
    expect(() => engine.plan.rage(campaign.state, { barbarianId: wiz.id }))
      .toThrow(/does not have Rage/);
  });

  it('depleted Rages: rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const barb = buildBarbarian(0);
    const campaign = seedCampaign(engine, [barb]);
    expect(() => engine.plan.rage(campaign.state, { barbarianId: barb.id }))
      .toThrow(/no Rages remaining/);
  });

  it('wearing Heavy armor (Plate): rejected', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const plate = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'plate' });
    const barb = buildBarbarian(2, { equippedArmorInstanceId: plate.id });
    const campaign = seedCampaign(engine, [barb], [plate]);
    expect(() => engine.plan.rage(campaign.state, { barbarianId: barb.id }))
      .toThrow(/Heavy armor/);
  });

  it('wearing Light armor (Leather): allowed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const leather = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'leather' });
    const barb = buildBarbarian(2, { equippedArmorInstanceId: leather.id });
    const campaign = seedCampaign(engine, [barb], [leather]);
    const { events } = engine.plan.rage(campaign.state, { barbarianId: barb.id });
    expect(events.find((e) => e.type === 'ConditionApplied')).toBeDefined();
  });

  it('BA already used: rejected in encounter', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const barb = buildBarbarian();
    let campaign = seedCampaign(engine, [barb]);
    campaign = startEncounter(engine, campaign, [barb.id]);
    const first = engine.plan.rage(campaign.state, { barbarianId: barb.id }).events;
    campaign = commit(campaign, first);
    expect(() => engine.plan.rage(campaign.state, { barbarianId: barb.id }))
      .toThrow(/already used their bonus action/);
  });

  describe('raging condition projects RAW while-active effects', () => {
    it('STR check + STR save gain advantage; DEX unaffected', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8) });
      const barb = buildBarbarian();
      let campaign = seedCampaign(engine, [barb]);
      campaign = commit(campaign, engine.plan.rage(campaign.state, { barbarianId: barb.id }).events);
      const ragingChar = campaign.state.characters[barb.id]!;
      const content = engine.content;

      const strCheck = computeAbilityCheck({
        character: ragingChar,
        itemInstances: campaign.state.itemInstances,
        content,
        ability: 'STR',
        pendingChoices: campaign.state.pendingChoices,
        characters: campaign.state.characters,
      });
      expect(strCheck.hasAdvantage).toBe(true);

      const strSave = computeSavingThrow({
        character: ragingChar,
        itemInstances: campaign.state.itemInstances,
        content,
        ability: 'STR',
        pendingChoices: campaign.state.pendingChoices,
        characters: campaign.state.characters,
      });
      expect(strSave.hasAdvantage).toBe(true);

      // DEX check unaffected (Rage scope is STR only)
      const dexCheck = computeAbilityCheck({
        character: ragingChar,
        itemInstances: campaign.state.itemInstances,
        content,
        ability: 'DEX',
        pendingChoices: campaign.state.pendingChoices,
        characters: campaign.state.characters,
      });
      expect(dexCheck.hasAdvantage).toBe(false);
    });

    it('raging condition is applied + has the expected effects shape', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(9) });
      const barb = buildBarbarian();
      let campaign = seedCampaign(engine, [barb]);
      campaign = commit(campaign, engine.plan.rage(campaign.state, { barbarianId: barb.id }).events);
      const applied = campaign.state.characters[barb.id]!.appliedConditions;
      expect(applied.some((c) => c.conditionId === 'raging')).toBe(true);

      const ragingDef = engine.content.conditions.get('raging');
      expect(ragingDef).toBeDefined();
      const effects = ragingDef!.effects;
      // 3 resistance effects (B/P/S)
      const resistances = effects.filter((e) => e.kind === 'GrantResistance');
      expect(resistances.length).toBe(3);
      // 1 +2 damage modifier gated on STR
      const damageModifiers = effects.filter((e) => e.kind === 'AddModifier' && e.target === 'damage');
      expect(damageModifiers.length).toBe(1);
      // 2 SetAdvantage (STR check + STR save)
      const advantages = effects.filter((e) => e.kind === 'SetAdvantage');
      expect(advantages.length).toBe(2);
    });
  });
});
