// Slice 520: Spare the Dying + new `stabilize` spell mechanic.
//
// RAW (Spare the Dying, 2024 PHB): "Casting Time: Action. Range: 15
// feet. Components: V, S. Duration: Instantaneous. Choose a creature
// within range that has 0 Hit Points and isn't dead. The creature
// becomes Stable."
//
// Engine surface: new `mechanicalEffects.kind: 'stabilize'` entry on
// the spell schema. The cast-spell planner dispatches to
// `planStabilizeMechanic`, which emits a `Stabilized` event on the
// first targetId when the target is at 0 HP and not already stable.
// Ineligible targets produce zero events (spell does nothing); the
// surrounding cast economy still runs.
//
// Documented RAW deviations:
//   - "Choose a creature within range" range-of-15-feet is not
//     engine-enforced (consumer-managed, like all other range gates
//     in this engine).
//   - "isn't dead" is interpreted as "deathSaves.failures < 3"
//     implicitly by the existing Stabilized reducer; the planner
//     gates only on hp.current === 0 + !stable, which is sufficient
//     for the canonical use case (downed but not yet dead allies).

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mara',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'cleric', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    preparedSpells: ['spare-the-dying'],
  });

const buildDowned = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Downed Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 0, max: 10, temp: 0 },
    deathSaves: { successes: 1, failures: 1, stable: false },
  });

const buildHealthy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Healthy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildAlreadyStable = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Stable Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 0, max: 10, temp: 0 },
    deathSaves: { successes: 0, failures: 0, stable: true },
  });

describe('Spare the Dying (slice 520)', () => {
  it('the spell wires the new `stabilize` mechanical effect', () => {
    const spell = PACK.spells.find((s) => s.id === 'spare-the-dying');
    expect(spell).toBeDefined();
    expect(spell!.mechanicalEffects).toEqual([{ kind: 'stabilize' }]);
  });

  it('casting on a downed (0 HP, not stable) target emits Stabilized and flips deathSaves.stable to true', () => {
    const cleric = buildCleric();
    const target = buildDowned();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(520) });
    let campaign: Campaign = engine.createCampaign({ name: 'stabilize' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    expect(campaign.state.characters[target.id]!.deathSaves.stable).toBe(false);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'spare-the-dying',
      slotLevel: 0,
      targetIds: [target.id],
    }).events;
    const stabilized = events.find((e) => e.type === 'Stabilized');
    expect(stabilized).toBeDefined();
    expect((stabilized as { targetId: string }).targetId).toBe(target.id);
    campaign = commit(campaign, events);
    expect(campaign.state.characters[target.id]!.deathSaves.stable).toBe(true);
  });

  it('casting on a target above 0 HP emits no Stabilized event (RAW gate)', () => {
    const cleric = buildCleric();
    const target = buildHealthy();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(521) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-op-healthy' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'spare-the-dying',
      slotLevel: 0,
      targetIds: [target.id],
    }).events;
    expect(events.some((e) => e.type === 'Stabilized')).toBe(false);
  });

  it('casting on an already-stable target emits no Stabilized event (idempotent no-op)', () => {
    const cleric = buildCleric();
    const target = buildAlreadyStable();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(522) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-op-stable' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'spare-the-dying',
      slotLevel: 0,
      targetIds: [target.id],
    }).events;
    expect(events.some((e) => e.type === 'Stabilized')).toBe(false);
  });

  it('casting without a targetId throws (the mechanic requires one explicit target)', () => {
    const cleric = buildCleric();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(523) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-target' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: cleric.id,
        spellId: 'spare-the-dying',
        slotLevel: 0,
        targetIds: [],
      }),
    ).toThrow(/stabilize requires a targetId/i);
  });
});
