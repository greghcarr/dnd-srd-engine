// Slice 721: Druid L5 Wild Resurgence — two no-action conversions.
//   slot-to-wild-shape: when out of Wild Shape, expend a spell slot to
//     regain one Wild Shape use.
//   wild-shape-to-slot: expend a Wild Shape use to regain a level-1 spell
//     slot, once per Long Rest.

import { describe, expect, it } from 'vitest';
import { createEngine, seedResourcesFromContent } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type { SpellSlotConsumedEvent } from '../../../src/schemas/events/spellcasting.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });

const buildDruid = (level: number): Character =>
  seedResourcesFromContent(
    CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Druid',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'druid', level, hitDiceRemaining: level }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 10 },
      hp: { current: 24, max: 24, temp: 0 },
    }),
    ENGINE.content,
  );

const seed = (character: Character): Campaign =>
  commit(ENGINE.createCampaign({ name: 'wild-resurgence' }), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);

const spendResource = (campaign: Campaign, characterId: string, resourceId: string, amount: number): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ResourceSpent', characterId: characterId as ULID, resourceId, amount } satisfies ResourceSpentEvent,
  ]);

const consumeSlot = (campaign: Campaign, characterId: string, slotLevel: number): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'SpellSlotConsumed', characterId: characterId as ULID, slotLevel } satisfies SpellSlotConsumedEvent,
  ]);

const res = (campaign: Campaign, characterId: string, resourceId: string): number =>
  campaign.state.characters[characterId]!.resources.find((r) => r.resourceId === resourceId)?.current ?? -1;
const slotsUsed = (campaign: Campaign, characterId: string, level: number): number =>
  campaign.state.characters[characterId]!.spellSlotsUsed[String(level)] ?? 0;

describe('slice 721: Wild Resurgence — slot → Wild Shape', () => {
  it('regains a Wild Shape use by expending a spell slot when out of uses', () => {
    const druid = buildDruid(5);
    let campaign = seed(druid);
    const max = res(campaign, druid.id, 'wild-shape');
    expect(max).toBeGreaterThan(0);
    campaign = spendResource(campaign, druid.id, 'wild-shape', max); // 0 left
    campaign = commit(campaign, ENGINE.plan.wildResurgence(campaign.state, { druidId: druid.id, mode: 'slot-to-wild-shape' }).events);
    expect(res(campaign, druid.id, 'wild-shape')).toBe(1); // regained one use
    expect(slotsUsed(campaign, druid.id, 1)).toBe(1); // a level-1 slot was expended
  });

  it('rejected while the druid still has Wild Shape uses', () => {
    const druid = buildDruid(5);
    const campaign = seed(druid);
    expect(() =>
      ENGINE.plan.wildResurgence(campaign.state, { druidId: druid.id, mode: 'slot-to-wild-shape' }),
    ).toThrow(/needs none left/);
  });
});

describe('slice 721: Wild Resurgence — Wild Shape → slot', () => {
  it('regains a level-1 slot by expending a Wild Shape use, once per Long Rest', () => {
    const druid = buildDruid(5);
    let campaign = seed(druid);
    campaign = consumeSlot(campaign, druid.id, 1); // an expended L1 slot to regain
    expect(slotsUsed(campaign, druid.id, 1)).toBe(1);
    const wsBefore = res(campaign, druid.id, 'wild-shape');

    campaign = commit(campaign, ENGINE.plan.wildResurgence(campaign.state, { druidId: druid.id, mode: 'wild-shape-to-slot' }).events);
    expect(slotsUsed(campaign, druid.id, 1)).toBe(0); // L1 slot regained
    expect(res(campaign, druid.id, 'wild-shape')).toBe(wsBefore - 1); // a Wild Shape use spent
    expect(res(campaign, druid.id, 'wild-resurgence')).toBe(0); // gate consumed

    // Second use before a Long Rest is blocked by the gate.
    campaign = consumeSlot(campaign, druid.id, 1);
    expect(() =>
      ENGINE.plan.wildResurgence(campaign.state, { druidId: druid.id, mode: 'wild-shape-to-slot' }),
    ).toThrow(/already converted a Wild Shape use to a slot/);
  });

  it('rejected when there is no expended level-1 slot to regain', () => {
    const druid = buildDruid(5);
    const campaign = seed(druid); // all slots unspent
    expect(() =>
      ENGINE.plan.wildResurgence(campaign.state, { druidId: druid.id, mode: 'wild-shape-to-slot' }),
    ).toThrow(/no expended level-1 spell slot/);
  });
});

describe('slice 721: Wild Resurgence gating', () => {
  it('a Druid below level 5 does not have it', () => {
    const druid = buildDruid(4);
    const campaign = seed(druid);
    expect(() =>
      ENGINE.plan.wildResurgence(campaign.state, { druidId: druid.id, mode: 'slot-to-wild-shape' }),
    ).toThrow(/requires Druid level 5/);
  });
});
