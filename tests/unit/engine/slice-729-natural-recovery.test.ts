// Slice 729: Druid Circle of the Land L6 — Natural Recovery (slot recovery).
//
// SRD 5.2.1: on a Short Rest, recover expended spell slots with a combined
// level ≤ ceil(Druid level / 2), none level 6+, once per Long Rest.

import { describe, expect, it } from 'vitest';
import { createEngine, seedResourcesFromContent } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
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
      classes: [{ classId: 'druid', level, hitDiceRemaining: level, subclassId: 'circle-of-the-land' }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 10 },
      hp: { current: 30, max: 30, temp: 0 },
    }),
    ENGINE.content,
  );

const seed = (character: Character): Campaign =>
  commit(ENGINE.createCampaign({ name: 'natural-recovery' }), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);

const consumeSlot = (campaign: Campaign, characterId: string, slotLevel: number): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'SpellSlotConsumed', characterId: characterId as ULID, slotLevel } satisfies SpellSlotConsumedEvent,
  ]);

const slotsUsed = (campaign: Campaign, id: string, level: number): number =>
  campaign.state.characters[id]!.spellSlotsUsed[String(level)] ?? 0;
const res = (campaign: Campaign, id: string, resourceId: string): number =>
  campaign.state.characters[id]!.resources.find((r) => r.resourceId === resourceId)?.current ?? -1;

describe('slice 729: Natural Recovery (Circle of the Land L6)', () => {
  it('recovers expended slots up to ceil(level/2) combined, once per long rest', () => {
    const druid = buildDruid(6); // budget = ceil(6/2) = 3
    let campaign = seed(druid);
    expect(res(campaign, druid.id, 'natural-recovery')).toBe(1);
    campaign = consumeSlot(campaign, druid.id, 1); // expend a L1 + a L2
    campaign = consumeSlot(campaign, druid.id, 2);
    campaign = commit(campaign, ENGINE.plan.naturalRecovery(campaign.state, {
      druidId: druid.id, slots: [{ level: 2, count: 1 }, { level: 1, count: 1 }], // combined 3
    }).events);
    expect(slotsUsed(campaign, druid.id, 1)).toBe(0); // recovered
    expect(slotsUsed(campaign, druid.id, 2)).toBe(0);
    expect(res(campaign, druid.id, 'natural-recovery')).toBe(0); // gate spent
    // Second use before a long rest is blocked.
    campaign = consumeSlot(campaign, druid.id, 1);
    expect(() =>
      ENGINE.plan.naturalRecovery(campaign.state, { druidId: druid.id, slots: [{ level: 1, count: 1 }] }),
    ).toThrow(/already used Natural Recovery/);
  });

  it('rejects exceeding the combined-level budget', () => {
    const druid = buildDruid(6); // budget 3
    let campaign = seed(druid);
    campaign = consumeSlot(campaign, druid.id, 2);
    campaign = consumeSlot(campaign, druid.id, 2);
    expect(() =>
      ENGINE.plan.naturalRecovery(campaign.state, { druidId: druid.id, slots: [{ level: 2, count: 2 }] }), // combined 4
    ).toThrow(/combined slot levels/);
  });

  it('rejects recovering more slots than were expended', () => {
    const druid = buildDruid(6);
    let campaign = seed(druid);
    campaign = consumeSlot(campaign, druid.id, 1); // only 1 expended
    expect(() =>
      ENGINE.plan.naturalRecovery(campaign.state, { druidId: druid.id, slots: [{ level: 1, count: 2 }] }),
    ).toThrow(/only 1 expended/);
  });

  it('rejects a level-6+ slot', () => {
    const druid = buildDruid(6);
    const campaign = seed(druid);
    expect(() =>
      ENGINE.plan.naturalRecovery(campaign.state, { druidId: druid.id, slots: [{ level: 6, count: 1 }] }),
    ).toThrow(/levels 1-5 only/);
  });

  it('a druid without the subclass feature has no Natural Recovery', () => {
    const druid = seedResourcesFromContent(
      CharacterSchema.parse({
        id: newCharacterId(), name: 'Plain Druid', speciesId: 'human', backgroundId: 'sage',
        classes: [{ classId: 'druid', level: 6, hitDiceRemaining: 6 }], // no subclass
        abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 10 },
        hp: { current: 30, max: 30, temp: 0 },
      }),
      ENGINE.content,
    );
    const campaign = seed(druid);
    expect(() =>
      ENGINE.plan.naturalRecovery(campaign.state, { druidId: druid.id, slots: [{ level: 1, count: 1 }] }),
    ).toThrow(/does not have Natural Recovery/);
  });
});
