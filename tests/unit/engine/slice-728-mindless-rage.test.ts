// Slice 728: Barbarian Path of the Berserker L6 — Mindless Rage.
//
// SRD 5.2.1: "You have Immunity to the Charmed and Frightened conditions
// while your Rage is active. If you're Charmed or Frightened when you
// enter your Rage, the condition ends on you."
//
// Wired via planRage: at Berserker L6+, entering Rage applies a
// `mindless-rage-active` condition (carrying the two GrantConditionImmunity
// entries) and ends any current Charmed/Frightened.

import { describe, expect, it } from 'vitest';
import { createEngine, seedResourcesFromContent } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { isImmuneToCondition } from '../../../src/derive/condition-immunity.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });

const buildBarbarian = (level: number, subclassId?: string): Character =>
  seedResourcesFromContent(
    CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Barbarian',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'barbarian', level, hitDiceRemaining: level, ...(subclassId !== undefined ? { subclassId } : {}) }],
      abilityScores: { STR: 16, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 10 },
      hp: { current: 50, max: 50, temp: 0 },
    }),
    ENGINE.content,
  );

const seed = (character: Character): Campaign =>
  commit(ENGINE.createCampaign({ name: 'mindless-rage' }), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);

const applyCondition = (campaign: Campaign, targetId: string, conditionId: string): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId: targetId as ULID, conditionId, appliedConditionId: newAppliedConditionId() } satisfies ConditionAppliedEvent,
  ]);

const hasCondition = (campaign: Campaign, id: string, conditionId: string): boolean =>
  campaign.state.characters[id]!.appliedConditions.some((c) => c.conditionId === conditionId);

describe('slice 728: Mindless Rage (Berserker L6)', () => {
  it('a L6 Berserker becomes immune to Charmed + Frightened on entering Rage', () => {
    const barb = buildBarbarian(6, 'path-of-the-berserker');
    let campaign = seed(barb);
    expect(isImmuneToCondition({ state: campaign.state, content: ENGINE.content, targetId: barb.id, conditionId: 'frightened' })).toBe(false);
    campaign = commit(campaign, ENGINE.plan.rage(campaign.state, { barbarianId: barb.id }).events);
    expect(hasCondition(campaign, barb.id, 'mindless-rage-active')).toBe(true);
    expect(isImmuneToCondition({ state: campaign.state, content: ENGINE.content, targetId: barb.id, conditionId: 'frightened' })).toBe(true);
    expect(isImmuneToCondition({ state: campaign.state, content: ENGINE.content, targetId: barb.id, conditionId: 'charmed' })).toBe(true);
  });

  it('entering Rage ends an existing Frightened condition', () => {
    const barb = buildBarbarian(6, 'path-of-the-berserker');
    let campaign = seed(barb);
    campaign = applyCondition(campaign, barb.id, 'frightened');
    expect(hasCondition(campaign, barb.id, 'frightened')).toBe(true);
    campaign = commit(campaign, ENGINE.plan.rage(campaign.state, { barbarianId: barb.id }).events);
    expect(hasCondition(campaign, barb.id, 'frightened')).toBe(false);
  });

  it('a L5 Berserker does not get Mindless Rage yet', () => {
    const barb = buildBarbarian(5, 'path-of-the-berserker');
    let campaign = seed(barb);
    campaign = commit(campaign, ENGINE.plan.rage(campaign.state, { barbarianId: barb.id }).events);
    expect(hasCondition(campaign, barb.id, 'mindless-rage-active')).toBe(false);
  });
});
