// Slice 894 — Giant Insect (the 2024 SUMMON). Closes the L7 audit Area-2
// DIVERGENCE `l4-giant-insect`.
//
// NOTE: the audit row's "transforms vermin into giant versions" wording is the
// 2014 spell. The SRD 5.2.1 Giant Insect is a CONJURATION SUMMON: "You summon a
// giant centipede, spider, or wasp ... It manifests in an unoccupied space ...
// and uses the Giant Insect stat block. ... The creature disappears when it
// drops to 0 Hit Points or when the spell ends." (Concentration, 10 min.) So it
// wires as a `summon` mechanic reusing the shipped summon primitive (like
// Conjure Animals / Summon Beast): AC 11 + spell level (= 15 at L4), HP 30 (+10
// per slot above 4), Speed 40. The form choice + the form-specific attacks
// (Poison Jab / Web Bolt / Venomous Spew) are consumer-driven, as for every
// summon.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { CompanionSummonedEvent } from '../../../src/schemas/events/summons.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildDruid = (level = 7): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Druid', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'druid', level, hitDiceRemaining: level, subclassId: level >= 3 ? 'circle-of-the-land' : undefined }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 }, featsTaken: [],
    preparedSpells: ['giant-insect'],
  });

const cast = (slotLevel: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const druid = buildDruid();
  let campaign: Campaign = engine.createCampaign({ name: 'giant-insect' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: druid } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: druid.id, spellId: 'giant-insect', slotLevel, targetIds: [],
    // The summon-scaling assertions don't depend on slot availability; skip the
    // slot gate so the L6 upcast case works on a L7 Druid (no L6 slots).
    noSlotCost: true,
  }).events;
  return { events, druidId: druid.id };
};

describe('Giant Insect summon (slice 894)', () => {
  it('cast at L4 summons the Giant Insect (HP 30, AC 15) controlled by the caster', () => {
    const { events, druidId } = cast(4);
    const summoned = events.find((e) => e.type === 'CompanionSummoned') as CompanionSummonedEvent | undefined;
    expect(summoned).toBeDefined();
    expect(summoned!.hp).toBe(30);
    expect(summoned!.ac).toBe(15);
    expect(summoned!.controllerId).toBe(druidId);
    expect(summoned!.spellId).toBe('giant-insect');
  });

  it('HP scales +10 per slot above 4 (slot 6 -> 50 HP)', () => {
    const { events } = cast(6);
    const summoned = events.find((e) => e.type === 'CompanionSummoned') as CompanionSummonedEvent;
    expect(summoned.hp).toBe(30 + (6 - 4) * 10);
  });

  it('is Concentration-bound: the summon shares the ConcentrationStarted effect id', () => {
    const { events } = cast(4);
    const summoned = events.find((e) => e.type === 'CompanionSummoned') as CompanionSummonedEvent;
    const conc = events.find((e) => e.type === 'ConcentrationStarted') as ConcentrationStartedEvent | undefined;
    expect(conc).toBeDefined();
    expect(summoned.effectInstanceId).toBeDefined();
    expect(summoned.effectInstanceId).toBe(conc!.effectInstanceId);
  });
});
