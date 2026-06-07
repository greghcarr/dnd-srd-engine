// Slice 731: Cleric Life Domain L6 — Blessed Healer.
//
// SRD 5.2.1: "Immediately after you cast a spell with a spell slot that
// restores Hit Points to one or more creatures other than yourself, you
// regain Hit Points equal to 2 plus the spell slot's level."

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HealedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildCleric = (level: number, subclassId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Cleric',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level, hitDiceRemaining: level, ...(subclassId !== undefined ? { subclassId } : {}) }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    hp: { current: 40, max: 40, temp: 0 },
    preparedSpells: ['cure-wounds'],
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 5, max: 28, temp: 0 },
  });

const setup = (characters: Character[]): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'blessed-healer' });
  campaign = commit(campaign, characters.map(
    (c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
  ));
  return { engine, campaign };
};

const blessedHeal = (events: ReadonlyArray<{ type: string }>): HealedEvent | undefined =>
  events.find((e) => e.type === 'Healed' && (e as HealedEvent).source === 'blessed-healer') as HealedEvent | undefined;

describe('slice 731: Blessed Healer (Life Domain L6)', () => {
  it('healing another with a slot spell also heals the cleric (2 + slot level)', () => {
    const cleric = buildCleric(6, 'life-domain');
    const ally = buildAlly();
    const { engine, campaign } = setup([cleric, ally]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'cure-wounds', slotLevel: 1, targetIds: [ally.id],
    }).events;
    const self = blessedHeal(events);
    expect(self, 'no Blessed Healer self-heal emitted').toBeDefined();
    expect(self!.targetId).toBe(cleric.id);
    expect(self!.amount).toBe(3); // 2 + slot level 1
  });

  it('scales with the slot level', () => {
    const cleric = buildCleric(6, 'life-domain');
    const ally = buildAlly();
    const { engine, campaign } = setup([cleric, ally]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'cure-wounds', slotLevel: 3, targetIds: [ally.id],
    }).events;
    expect(blessedHeal(events)!.amount).toBe(5); // 2 + 3
  });

  it('does not trigger when the cleric heals only themselves', () => {
    const cleric = buildCleric(6, 'life-domain');
    const { engine, campaign } = setup([cleric]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'cure-wounds', slotLevel: 1, targetIds: [cleric.id],
    }).events;
    expect(blessedHeal(events)).toBeUndefined();
  });

  it('a L5 Life cleric does not have Blessed Healer yet', () => {
    const cleric = buildCleric(5, 'life-domain');
    const ally = buildAlly();
    const { engine, campaign } = setup([cleric, ally]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'cure-wounds', slotLevel: 1, targetIds: [ally.id],
    }).events;
    expect(blessedHeal(events)).toBeUndefined();
  });
});
