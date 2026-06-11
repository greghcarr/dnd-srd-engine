// Slice 806: RAW (spells.md): "On a turn, you can expend only one spell
// slot to cast a spell. This rule means you can't, for example, cast a
// spell with a spell slot using the Magic action and another one using a
// Bonus Action on the same turn." (Area 4 divergence
// `bonus-action-spell-restriction` — note the audit's 2014-flavored
// wording; the actual SRD 5.2.1 rule is one SLOT per turn, not "action
// must be a cantrip". You CAN pair a slot spell with a cantrip.)
//
// A new combatant turnUsage flag `spellSlotExpendedThisTurn` is set when a
// SpellSlotConsumed / PactSlotConsumed lands in an active encounter and
// reset at TurnStarted; the cast planner blocks a second slot-expending
// cast while it's set.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Cleric', speciesId: 'human', backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 33, max: 33, temp: 0 },
    knownSpells: ['healing-word', 'guiding-bolt', 'sacred-flame'],
    preparedSpells: ['healing-word', 'guiding-bolt', 'sacred-flame'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

// Seat both in an encounter and advance to the cleric's turn.
const onClericTurn = (): { engine: ReturnType<typeof createEngine>; campaign: Campaign; clericId: string; targetId: string; encounterId: string } => {
  const cleric = buildCleric();
  const target = buildTarget();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(806) });
  let campaign: Campaign = engine.createCampaign({ name: 'one-slot' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [cleric.id, target.id] });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  const active = () => campaign.state.encounters[enc.encounterId]!;
  while (active().combatants[active().activeIndex]!.combatantId !== cleric.id) {
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
  }
  return { engine, campaign, clericId: cleric.id, targetId: target.id, encounterId: enc.encounterId };
};

describe('One spell slot per turn (slice 806)', () => {
  it('a Bonus Action slot spell then an Action slot spell in the same turn is blocked', () => {
    const s = onClericTurn();
    let campaign = commit(s.campaign, s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.clericId, spellId: 'healing-word', slotLevel: 1, targetIds: [s.clericId], ignorePreparation: true,
    }).events);
    expect(campaign.state.encounters[s.encounterId]!.combatants.find((c) => c.combatantId === s.clericId)!.turnUsage.spellSlotExpendedThisTurn).toBe(true);
    // Second slot spell (Action) this turn → blocked.
    expect(() => s.engine.plan.castSpell(campaign.state, {
      characterId: s.clericId, spellId: 'guiding-bolt', slotLevel: 1, targetIds: [s.targetId], ignorePreparation: true,
    })).toThrow(/one slot per turn/i);
  });

  it('a slot spell + a cantrip in the same turn is allowed (the cantrip expends no slot)', () => {
    const s = onClericTurn();
    let campaign = commit(s.campaign, s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.clericId, spellId: 'healing-word', slotLevel: 1, targetIds: [s.clericId], ignorePreparation: true,
    }).events);
    expect(() => s.engine.plan.castSpell(campaign.state, {
      characterId: s.clericId, spellId: 'sacred-flame', slotLevel: 0, targetIds: [s.targetId], ignorePreparation: true,
    })).not.toThrow();
  });

  it('a fresh turn restores the budget', () => {
    const s = onClericTurn();
    let campaign = commit(s.campaign, s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.clericId, spellId: 'healing-word', slotLevel: 1, targetIds: [s.clericId], ignorePreparation: true,
    }).events);
    // Advance around to the cleric's next turn.
    const active = () => campaign.state.encounters[s.encounterId]!;
    do {
      campaign = commit(campaign, s.engine.plan.advanceTurn(campaign.state, { encounterId: s.encounterId }).events);
    } while (active().combatants[active().activeIndex]!.combatantId !== s.clericId);
    expect(active().combatants.find((c) => c.combatantId === s.clericId)!.turnUsage.spellSlotExpendedThisTurn).toBe(false);
    expect(() => s.engine.plan.castSpell(campaign.state, {
      characterId: s.clericId, spellId: 'guiding-bolt', slotLevel: 1, targetIds: [s.targetId], ignorePreparation: true,
    })).not.toThrow();
  });

  it('outside an encounter there is no per-turn restriction', () => {
    const cleric = buildCleric();
    const target = buildTarget();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(807) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'healing-word', slotLevel: 1, targetIds: [cleric.id], ignorePreparation: true,
    }).events);
    expect(() => engine.plan.castSpell(campaign.state, {
      characterId: cleric.id, spellId: 'guiding-bolt', slotLevel: 1, targetIds: [target.id], ignorePreparation: true,
    })).not.toThrow();
  });
});
