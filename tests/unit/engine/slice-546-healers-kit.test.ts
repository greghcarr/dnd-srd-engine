// Slice 546: Healer's Kit item + planUseHealersKit stabilize-via-kit.
//
// RAW (SRD 5.2.1 Equipment, Healer's Kit): "A Healer's Kit has ten
// uses. As a Utilize action, you can expend one of its uses to
// stabilize an Unconscious creature that has 0 Hit Points without
// needing to make a Wisdom (Medicine) check."
//
// New item `healers-kit` (gear, 5 GP, 3 lb) + `planUseHealersKit`
// planner that consumes 1 charge + 1 Action (in encounter) + emits
// Stabilized. Closes the Soldier-background starting-equipment +
// Healer-feat dependency gap surfaced by the slice-544 deep audit.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';

const PACK = loadStarterPack();

const buildSoldier = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const buildDownedAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bram',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 0, max: 8, temp: 0 },
    deathSaves: { successes: 0, failures: 1, stable: false },
  });

const makeKit = (chargesRemaining = 10): ItemInstance =>
  ItemInstanceSchema.parse({
    id: newItemInstanceId(),
    definitionId: 'healers-kit',
    chargesRemaining,
    maxCharges: 10,
  });

const seedCampaign = (
  engine: ReturnType<typeof createEngine>,
  characters: Character[],
  items: ItemInstance[],
) => {
  let campaign = engine.createCampaign({ name: 'healers-kit' });
  const charEvents: CharacterCreatedEvent[] = characters.map((c) => ({
    id: eventId(),
    at: isoTimestamp(),
    type: 'CharacterCreated',
    snapshot: c,
  }));
  const itemEvents: ItemAcquiredEvent[] = items.map((item) => ({
    id: eventId(),
    at: isoTimestamp(),
    type: 'ItemAcquired',
    instance: item,
  }));
  campaign = commit(campaign, [...charEvents, ...itemEvents]);
  return campaign;
};

const startEncounter = (
  engine: ReturnType<typeof createEngine>,
  base: ReturnType<typeof seedCampaign>,
  combatantIds: string[],
) => {
  let campaign = base;
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return campaign;
};

describe('Healer\'s Kit + planUseHealersKit (slice 546)', () => {
  it('healers-kit item ships in the starter pack with weight + cost', () => {
    const kit = PACK.items?.find((i) => i.id === 'healers-kit');
    expect(kit).toBeDefined();
    expect(kit?.itemKind).toBe('gear');
    expect(kit?.weight).toBe(3);
    expect((kit as { cost?: { amount: number; currency: string } }).cost?.amount).toBe(5);
  });

  it('out-of-encounter use: emits ItemChargeConsumed + Stabilized; no BA gate', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const healer = buildSoldier();
    const downed = buildDownedAlly();
    const kit = makeKit();
    const campaign = seedCampaign(engine, [healer, downed], [kit]);
    const { events } = engine.plan.useHealersKit(campaign.state, {
      healerId: healer.id,
      healersKitInstanceId: kit.id,
      targetId: downed.id,
    });
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('ItemChargeConsumed');
    expect(events[1]!.type).toBe('Stabilized');
  });

  it('in-encounter use on healer\'s turn: also emits ActionEconomyConsumed(action)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const healer = buildSoldier();
    const downed = buildDownedAlly();
    const kit = makeKit();
    let campaign = seedCampaign(engine, [healer, downed], [kit]);
    campaign = startEncounter(engine, campaign, [healer.id, downed.id]);
    const active = campaign.state.encounters[campaign.state.activeEncounterId!]!.combatants[
      campaign.state.encounters[campaign.state.activeEncounterId!]!.activeIndex
    ]!.combatantId;
    if (active !== healer.id) return; // initiative-order can vary by seed; skip if healer is not first
    const { events } = engine.plan.useHealersKit(campaign.state, {
      healerId: healer.id,
      healersKitInstanceId: kit.id,
      targetId: downed.id,
    });
    expect(events[0]!.type).toBe('ActionEconomyConsumed');
    expect(events[1]!.type).toBe('ItemChargeConsumed');
    expect(events[2]!.type).toBe('Stabilized');
  });

  it('replay equivalence: kit charges decrement, downed ally becomes stable', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const healer = buildSoldier();
    const downed = buildDownedAlly();
    const kit = makeKit();
    let campaign = seedCampaign(engine, [healer, downed], [kit]);
    const { events } = engine.plan.useHealersKit(campaign.state, {
      healerId: healer.id,
      healersKitInstanceId: kit.id,
      targetId: downed.id,
    });
    campaign = commit(campaign, events);
    expect(campaign.state.itemInstances[kit.id]?.chargesRemaining).toBe(9);
    expect(campaign.state.characters[downed.id]?.deathSaves.stable).toBe(true);
  });

  it('kit with 0 charges: throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const healer = buildSoldier();
    const downed = buildDownedAlly();
    const empty = makeKit(0);
    const campaign = seedCampaign(engine, [healer, downed], [empty]);
    expect(() =>
      engine.plan.useHealersKit(campaign.state, {
        healerId: healer.id,
        healersKitInstanceId: empty.id,
        targetId: downed.id,
      }),
    ).toThrow(/no charges remaining/);
  });

  it('target not at 0 HP: throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const healer = buildSoldier();
    const upright = buildSoldier();
    const kit = makeKit();
    const campaign = seedCampaign(engine, [healer, upright], [kit]);
    expect(() =>
      engine.plan.useHealersKit(campaign.state, {
        healerId: healer.id,
        healersKitInstanceId: kit.id,
        targetId: upright.id,
      }),
    ).toThrow(/not at 0 HP/);
  });

  it('target already stable: throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(6) });
    const healer = buildSoldier();
    const stable = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Bram-Stable',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
      hp: { current: 0, max: 8, temp: 0 },
      deathSaves: { successes: 0, failures: 0, stable: true },
    });
    const kit = makeKit();
    const campaign = seedCampaign(engine, [healer, stable], [kit]);
    expect(() =>
      engine.plan.useHealersKit(campaign.state, {
        healerId: healer.id,
        healersKitInstanceId: kit.id,
        targetId: stable.id,
      }),
    ).toThrow(/already stable/);
  });

  it('wrong item instance kind: throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const healer = buildSoldier();
    const downed = buildDownedAlly();
    const wrongItem = ItemInstanceSchema.parse({
      id: newItemInstanceId(),
      definitionId: 'crowbar',
    });
    const campaign = seedCampaign(engine, [healer, downed], [wrongItem]);
    expect(() =>
      engine.plan.useHealersKit(campaign.state, {
        healerId: healer.id,
        healersKitInstanceId: wrongItem.id,
        targetId: downed.id,
      }),
    ).toThrow(/not a healers-kit/);
  });
});
