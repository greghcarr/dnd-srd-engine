// Slice 665: non-damage area zone primitive — closes 3 deferred L2/L3
// spells (zone-of-truth, tiny-hut, wind-wall).
//
// The existing `zone` mechanic (slice 495) stamps positioned-AOE
// metadata on the EffectInstance for concentration spells (Fog Cloud,
// Darkness, Silent Image, etc.). This slice extends the same primitive
// to non-concentration zones via a new SpellEffectStarted event whose
// reducer creates an EffectInstance with `requiresConcentration: false`
// and does NOT claim the caster's concentration slot.
//
// What this audit pins:
//   1. zone-of-truth (L2, 10-min, non-concentration) emits
//      SpellEffectStarted with zone payload; reducer creates a
//      non-concentration EffectInstance; concentrationEffectId stays
//      unset.
//   2. tiny-hut (L3, 8-hour, non-concentration, ritual) same shape.
//   3. wind-wall (L3, concentration, 1-min) uses the existing
//      ConcentrationStarted path with zone payload (regression
//      check that the concentration zone path still works).
//   4. The caster can cast another concentration spell after a
//      non-concentration zone — the zone does NOT block.
//   5. Listed-duration expiry via planExpireSpellDurations cleans up
//      the non-concentration zone after its in-game duration elapses
//      (Zone of Truth at 10 minutes).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConcentrationStartedEvent,
  SpellEffectStartedEvent,
} from '../../../src/schemas/events/concentration.js';
import type { InGameTimeAdvancedEvent } from '../../../src/schemas/events/session.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sera',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5, subclassId: 'life-domain' }],
    abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5, subclassId: 'evoker' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const buildDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wren',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 5, hitDiceRemaining: 5, subclassId: 'circle-of-the-land' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 18, CHA: 10 },
    hp: { current: 32, max: 32, temp: 0 },
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'non-damage-zone' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 665: non-damage area zone primitive', () => {
  it('zone-of-truth (L2 non-concentration) emits SpellEffectStarted with zone payload; EffectInstance has requiresConcentration: false', () => {
    const cleric = buildCleric();
    const s = seed(cleric);
    const out = s.engine.plan.castSpell(s.campaign.state, {
      characterId: cleric.id,
      spellId: 'zone-of-truth',
      slotLevel: 2,
      targetIds: [],
      targetPosition: { x: 10, y: 10 },
      ignorePreparation: true,
    });
    const started = out.events.find(
      (e): e is SpellEffectStartedEvent => e.type === 'SpellEffectStarted',
    );
    expect(started, 'SpellEffectStarted not emitted for zone-of-truth').toBeDefined();
    expect(started!.zone).toEqual({
      shape: 'sphere',
      size: 15,
      center: { x: 10, y: 10 },
    });
    // No ConcentrationStarted (Zone of Truth is non-concentration).
    expect(out.events.some((e) => e.type === 'ConcentrationStarted')).toBe(false);

    // Post-commit: EffectInstance exists with requiresConcentration: false.
    const after = commit(s.campaign, out.events);
    const effect = after.state.effectInstances[started!.effectInstanceId];
    expect(effect).toBeDefined();
    expect(effect!.requiresConcentration).toBe(false);
    expect(effect!.zone).toEqual({ shape: 'sphere', size: 15, center: { x: 10, y: 10 } });
    // Caster's concentration slot is NOT claimed.
    expect(after.state.characters[cleric.id]!.concentrationEffectId).toBeUndefined();
  });

  it('tiny-hut (L3 non-concentration ritual) emits SpellEffectStarted with zone payload + 8-hour duration', () => {
    const wizard = buildWizard();
    const s = seed(wizard);
    const out = s.engine.plan.castSpell(s.campaign.state, {
      characterId: wizard.id,
      spellId: 'tiny-hut',
      slotLevel: 3,
      targetIds: [],
      targetPosition: { x: 5, y: 5 },
      ignorePreparation: true,
    });
    const started = out.events.find(
      (e): e is SpellEffectStartedEvent => e.type === 'SpellEffectStarted',
    );
    expect(started, 'SpellEffectStarted not emitted for tiny-hut').toBeDefined();
    expect(started!.zone).toEqual({
      shape: 'sphere',
      size: 10,
      center: { x: 5, y: 5 },
    });
    // 8 hours = 480 minutes.
    expect(started!.durationMinutes).toBe(480);
  });

  it('wind-wall (L3 concentration) uses the existing ConcentrationStarted path with zone payload', () => {
    const druid = buildDruid();
    const s = seed(druid);
    const out = s.engine.plan.castSpell(s.campaign.state, {
      characterId: druid.id,
      spellId: 'wind-wall',
      slotLevel: 3,
      targetIds: [],
      targetPosition: { x: 20, y: 0 },
      ignorePreparation: true,
    });
    const started = out.events.find(
      (e): e is ConcentrationStartedEvent => e.type === 'ConcentrationStarted',
    );
    expect(started, 'ConcentrationStarted not emitted for wind-wall').toBeDefined();
    expect(started!.zone).toEqual({
      shape: 'line',
      size: 50,
      center: { x: 20, y: 0 },
    });
    // No SpellEffectStarted (Wind Wall is concentration, so it uses
    // the existing path).
    expect(out.events.some((e) => e.type === 'SpellEffectStarted')).toBe(false);

    // Concentration slot IS claimed.
    const after = commit(s.campaign, out.events);
    expect(after.state.characters[druid.id]!.concentrationEffectId).toBe(started!.effectInstanceId);
  });

  it('caster can cast another concentration spell after a non-concentration zone (the zone does NOT claim concentration)', () => {
    const cleric = buildCleric();
    const s = seed(cleric);
    // Cast zone-of-truth (non-concentration).
    const zoneCast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: cleric.id,
      spellId: 'zone-of-truth',
      slotLevel: 2,
      targetIds: [],
      targetPosition: { x: 0, y: 0 },
      ignorePreparation: true,
    });
    let campaign = commit(s.campaign, zoneCast.events);
    // Now cast a concentration spell (Bless): no prior-concentration-broken event.
    const blessCast = s.engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'bless',
      slotLevel: 1,
      targetIds: [cleric.id],
      ignorePreparation: true,
    });
    const priorBroken = blessCast.events.find((e) => e.type === 'ConcentrationBroken');
    expect(priorBroken, 'Zone of Truth should not have claimed concentration; no prior-broken event expected').toBeUndefined();
  });

  it('non-concentration zone expires via planExpireSpellDurations after its listed duration', () => {
    const cleric = buildCleric();
    const s = seed(cleric);
    const out = s.engine.plan.castSpell(s.campaign.state, {
      characterId: cleric.id,
      spellId: 'zone-of-truth',
      slotLevel: 2,
      targetIds: [],
      targetPosition: { x: 0, y: 0 },
      ignorePreparation: true,
    });
    const started = out.events.find(
      (e): e is SpellEffectStartedEvent => e.type === 'SpellEffectStarted',
    )!;
    let campaign = commit(s.campaign, out.events);

    // Advance in-game time past the 10-minute duration.
    const advance: InGameTimeAdvancedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InGameTimeAdvanced',
      minutes: 11,
    };
    campaign = commit(campaign, [advance]);

    // The EffectInstance is still present at this point (the
    // consumer hasn't yet called planExpireSpellDurations).
    expect(campaign.state.effectInstances[started.effectInstanceId]).toBeDefined();

    // planExpireSpellDurations should emit a ConcentrationBroken
    // event for the elapsed zone-of-truth effect.
    const expire = s.engine.plan.expireSpellDurations(campaign.state);
    const broken = expire.events.find(
      (e) => e.type === 'ConcentrationBroken' && e.effectInstanceId === started.effectInstanceId,
    );
    expect(broken, 'planExpireSpellDurations did not emit ConcentrationBroken for the elapsed non-concentration zone').toBeDefined();

    // Commit the expiry: the EffectInstance is gone.
    campaign = commit(campaign, expire.events);
    expect(campaign.state.effectInstances[started.effectInstanceId]).toBeUndefined();
  });
});
