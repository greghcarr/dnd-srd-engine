// Slice 800: Exhaustion level 6 is fatal (Area 4 divergence
// `exhaustion-6-not-fatal`). RAW rules-glossary.md "Exhaustion": "You die
// if your Exhaustion level is 6." The reducer clamped exhaustion at
// EXHAUSTION_MAX (6) but never killed — a character sat at level 6 with a
// big penalty, alive. Both exhaustion mutation paths (the ConditionApplied
// 'exhaustion' channel and the ExhaustionChanged event) now mark death via
// the shared markCreatureDead helper (HP 0 + death-save failures at the
// kill threshold + Concentration dropped), the same shape instant-death
// (CreatureDestroyed) uses.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, ExhaustionChangedEvent, CreatureDestroyedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildPC = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Wanderer', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
  });

const seat = (): { campaign: Campaign; pc: Character } => {
  const pc = buildPC();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(800) });
  let campaign: Campaign = engine.createCampaign({ name: 'exhaustion' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
  ]);
  return { campaign, pc };
};

const exhaust = (campaign: Campaign, targetId: string, level: number): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId, conditionId: 'exhaustion', level, appliedConditionId: newAppliedConditionId() } satisfies ConditionAppliedEvent,
  ]);

const isDead = (c: Character | undefined): boolean =>
  c !== undefined && c.hp.current === 0 && c.deathSaves.failures >= 3 && c.deathSaves.stable === false;

describe('Exhaustion level 6 is fatal (slice 800)', () => {
  it('reaching Exhaustion 6 (ConditionApplied) kills the character', () => {
    const { campaign, pc } = seat();
    const after = exhaust(campaign, pc.id, 6);
    const c = after.state.characters[pc.id];
    expect(c?.exhaustion).toBe(6);
    expect(isDead(c)).toBe(true);
  });

  it('Exhaustion 5 is NOT fatal — the character is alive at full HP', () => {
    const { campaign, pc } = seat();
    const after = exhaust(campaign, pc.id, 5);
    const c = after.state.characters[pc.id];
    expect(c?.exhaustion).toBe(5);
    expect(c?.hp.current).toBe(44);
    expect(c?.deathSaves.failures).toBe(0);
    expect(isDead(c)).toBe(false);
  });

  it('crossing into 6 incrementally (5 then +1) kills', () => {
    const { campaign, pc } = seat();
    let after = exhaust(campaign, pc.id, 5);
    expect(isDead(after.state.characters[pc.id])).toBe(false);
    after = exhaust(after, pc.id, 1);
    expect(after.state.characters[pc.id]?.exhaustion).toBe(6);
    expect(isDead(after.state.characters[pc.id])).toBe(true);
  });

  it('the ExhaustionChanged event path also kills on landing at 6', () => {
    const { campaign, pc } = seat();
    let after = exhaust(campaign, pc.id, 5); // get to fromLevel 5
    after = commit(after, [
      { id: eventId(), at: isoTimestamp(), type: 'ExhaustionChanged', targetId: pc.id, fromLevel: 5, toLevel: 6 } satisfies ExhaustionChangedEvent,
    ]);
    expect(after.state.characters[pc.id]?.exhaustion).toBe(6);
    expect(isDead(after.state.characters[pc.id])).toBe(true);
  });

  it('instant-death (CreatureDestroyed) still kills after the shared-helper refactor', () => {
    const { campaign, pc } = seat();
    const after = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CreatureDestroyed', targetId: pc.id } satisfies CreatureDestroyedEvent,
    ]);
    expect(isDead(after.state.characters[pc.id])).toBe(true);
  });
});
