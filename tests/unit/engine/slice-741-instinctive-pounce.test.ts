// Slice 741: Barbarian L7 Instinctive Pounce.
//
// SRD 5.2.1: "As part of the Bonus Action you take to enter your Rage, you
// can move up to half your Speed."
//
// This is positional movement, which the engine deliberately does not model
// (positions / movement are consumer intent — see docs/engine-scope.md).
// Wiring it "literally" here means exposing the capability as a marker on
// the feature (`Custom { handlerId: 'instinctive-pounce' }`) that a
// position-aware consumer (e.g. dnd-web) reads to grant the half-Speed move
// when the barbarian rages. The engine does NOT fabricate a movement event
// on Rage (notably it does not reuse Disengaged, whose no-provoke semantics
// would over-grant — RAW Instinctive Pounce movement can provoke).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const MOVEMENT_EVENT_TYPES = ['CombatantMoved', 'Dashed', 'Disengaged'];

const buildBarbarian = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grok',
    speciesId: 'goliath',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 70, max: 70, temp: 0 },
    resources: [{ resourceId: 'rage', current: 3, max: 3 }],
  });

const barbarianFeatures = (level: string): ReadonlyArray<{ id: string; effects?: ReadonlyArray<{ kind: string }> }> =>
  (PACK.classes.find((c) => c.id === 'barbarian')?.levelTable?.[level]?.features as ReadonlyArray<{ id: string; effects?: ReadonlyArray<{ kind: string }> }>) ?? [];

describe('slice 741: Instinctive Pounce (Barbarian L7)', () => {
  it('the L7 row carries the Instinctive Pounce capability marker', () => {
    const f = barbarianFeatures('7').find((x) => x.id === 'instinctive-pounce');
    expect(f, 'barbarian L7 missing instinctive-pounce').toBeDefined();
    expect((f!.effects ?? []).some((e) => e.kind === 'Custom')).toBe(true);
  });

  it('a L6 barbarian does not have Instinctive Pounce yet', () => {
    expect(barbarianFeatures('6').some((x) => x.id === 'instinctive-pounce')).toBe(false);
  });

  it('entering Rage at L7 emits no engine movement event (the half-Speed move is consumer-applied)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(741) });
    const barb = buildBarbarian(7);
    let campaign = engine.createCampaign({ name: 'instinctive-pounce' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: barb } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.rage(campaign.state, { barbarianId: barb.id }).events;
    // Standard Rage events fire (resource + raging condition)...
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(true);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(true);
    // ...but no movement event is fabricated (positions are consumer scope).
    expect(events.some((e) => MOVEMENT_EVENT_TYPES.includes(e.type))).toBe(false);
  });
});
