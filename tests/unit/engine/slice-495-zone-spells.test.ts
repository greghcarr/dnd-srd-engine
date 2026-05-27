// Slice 495: positioned AOE-zone primitive + canonical users
// (Fog Cloud, Silent Image, Darkness).
//
// Engine additions:
//   - ZoneSchema (shape + size + center) in effect-instance.ts.
//   - EffectInstance.zone optional field — persists the positioned
//     AOE on the parent EffectInstance so consumers can read the zone
//     from live state. Concentration drop removes the EffectInstance,
//     removing the zone naturally.
//   - ConcentrationStartedEvent.zone optional field — carries the
//     same metadata on the event log.
//   - New SpellMechanic `kind: 'zone'` (pure marker; no inner fields).
//     The cast-spell planner reads the spell's `targeting` (shape +
//     size) + intent.targetPosition and stamps the zone on the
//     emitted ConcentrationStarted event.
//   - CastSpellIntent.targetPosition optional field — required when
//     the spell has a zone mechanic.
//
// Content additions:
//   - Fog Cloud / Silent Image / Darkness: mechanicalEffects [] ->
//     [{ kind: 'zone' }]. The engine now tracks the positioned AOE
//     for these spells; the actual obscurement / illusion / darkness
//     RAW effects stay consumer-managed.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildWizard = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    knownSpells: ['fog-cloud', 'silent-image', 'darkness', 'magic-missile'],
    spellSlotsUsed: {},
  });

describe('Zone spells (slice 495)', () => {
  it.each(['fog-cloud', 'silent-image', 'darkness'] as const)(
    '%s ships with a zone mechanic and pre-existing targeting shape/size',
    (spellId) => {
      const s = PACK.spells.find((sp) => sp.id === spellId);
      expect(s?.mechanicalEffects).toEqual([{ kind: 'zone' }]);
      expect(s?.targeting).toBeDefined();
      expect(s?.targeting?.shape).toBeDefined();
      expect(s?.targeting?.size).toBeGreaterThan(0);
    },
  );

  it('casting Fog Cloud with a targetPosition emits ConcentrationStarted carrying the zone', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const wizard = buildWizard(3);
    let campaign: Campaign = engine.createCampaign({ name: 'fog' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'fog-cloud',
      slotLevel: 1,
      targetIds: [],
      targetPosition: { x: 25, y: 10 },
    }).events;
    const conc = events.find((e) => e.type === 'ConcentrationStarted') as ConcentrationStartedEvent | undefined;
    expect(conc).toBeDefined();
    expect(conc?.zone).toEqual({ shape: 'sphere', size: 20, center: { x: 25, y: 10 } });
  });

  it('the EffectInstance reducer persists the zone on the effect instance', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const wizard = buildWizard(3);
    let campaign: Campaign = engine.createCampaign({ name: 'zone-state' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'darkness',
      slotLevel: 2,
      targetIds: [],
      targetPosition: { x: 15, y: 20 },
    }).events);
    const eid = campaign.state.characters[wizard.id]?.concentrationEffectId;
    expect(eid).toBeDefined();
    const effect = campaign.state.effectInstances[eid!];
    expect(effect?.zone).toEqual({ shape: 'sphere', size: 15, center: { x: 15, y: 20 } });
    expect(effect?.spellId).toBe('darkness');
  });

  it('casting a zone spell without targetPosition throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const wizard = buildWizard(1);
    let campaign: Campaign = engine.createCampaign({ name: 'no-pos' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'fog-cloud',
        slotLevel: 1,
        targetIds: [],
      }),
    ).toThrow(/zone mechanic and requires intent.targetPosition/i);
  });

  it('casting Silent Image: the zone uses the spell\'s cube 15 targeting', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const wizard = buildWizard(2);
    let campaign: Campaign = engine.createCampaign({ name: 'illusion' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'silent-image',
      slotLevel: 1,
      targetIds: [],
      targetPosition: { x: 0, y: 0 },
    }).events);
    const eid = campaign.state.characters[wizard.id]?.concentrationEffectId;
    const effect = campaign.state.effectInstances[eid!];
    expect(effect?.zone).toEqual({ shape: 'cube', size: 15, center: { x: 0, y: 0 } });
  });

  it('concentration drop removes the EffectInstance and its zone metadata', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const wizard = buildWizard(3);
    let campaign: Campaign = engine.createCampaign({ name: 'conc-drop' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'fog-cloud',
      slotLevel: 1,
      targetIds: [],
      targetPosition: { x: 25, y: 10 },
    }).events);
    const eid = campaign.state.characters[wizard.id]?.concentrationEffectId!;
    expect(campaign.state.effectInstances[eid]?.zone).toBeDefined();
    // Cast a second concentration spell to evict the first one — this
    // surfaces the slice-495 invariant that zone metadata is bound to
    // the EffectInstance and is removed when the instance is.
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'darkness',
      slotLevel: 2,
      targetIds: [],
      targetPosition: { x: 50, y: 50 },
    }).events);
    expect(campaign.state.effectInstances[eid]).toBeUndefined();
    const newEid = campaign.state.characters[wizard.id]?.concentrationEffectId!;
    expect(campaign.state.effectInstances[newEid]?.zone).toEqual({
      shape: 'sphere',
      size: 15,
      center: { x: 50, y: 50 },
    });
  });
});
