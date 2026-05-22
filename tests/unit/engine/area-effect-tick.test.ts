// Unit test for the area-effect extension to `aura-damage`. The
// mechanic now supports optional `damageDice` (condition-only zones)
// and `conditionOnFail` (e.g., Stinking Cloud applying `poisoned`
// without dealing damage). Damage-only auras (Spirit Guardians) keep
// working unchanged; mixed damage + condition (Wall-of-X with on-
// enter save) work too.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const buildCaster = (spellId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Caster',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 13, hitDiceRemaining: 13 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 70, max: 70, temp: 0 },
    featsTaken: [],
    preparedSpells: [spellId],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 8, INT: 10, WIS: 8, CHA: 8 },
    hp: { current: 30, max: 30, temp: 0 },
    featsTaken: [],
  });

const PACK = loadStarterPack();

describe('aura-damage mechanic: condition + damage extensions', () => {
  it('Stinking Cloud applies poisoned on a failed CON save (no damage)', () => {
    let proven = false;
    for (let seed = 1; seed < 60 && !proven; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const caster = buildCaster('stinking-cloud');
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'sc' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const castEvents = engine.plan.castSpell(campaign.state, {
        characterId: caster.id,
        spellId: 'stinking-cloud',
        slotLevel: 3,
        targetIds: [],
      }).events;
      campaign = commit(campaign, castEvents);

      const tickEvents = engine.plan.tickAura(campaign.state, {
        casterId: caster.id,
        targetIds: [target.id],
      }).events;
      const save = tickEvents.find((e) => e.type === 'SaveRolled');
      if (save === undefined) continue;
      if (save.success === true) continue;
      // Failed save: expect ConditionApplied for poisoned, and NO DamageApplied.
      const condApplied = tickEvents.find(
        (e) => e.type === 'ConditionApplied' && e.conditionId === 'poisoned',
      );
      expect(condApplied).toBeDefined();
      const damage = tickEvents.find((e) => e.type === 'DamageApplied');
      expect(damage).toBeUndefined();
      proven = true;
    }
    expect(proven, 'no failed save observed in seed search').toBe(true);
  });

  it('Cloud of Daggers deals slashing damage with no save (no SaveRolled event)', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const caster = buildCaster('cloud-of-daggers');
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'cod' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'cloud-of-daggers',
      slotLevel: 2,
      targetIds: [],
    }).events;
    campaign = commit(campaign, castEvents);

    const tickEvents = engine.plan.tickAura(campaign.state, {
      casterId: caster.id,
      targetIds: [target.id],
    }).events;
    const save = tickEvents.find((e) => e.type === 'SaveRolled');
    expect(save, 'no-save mechanic should not roll a save').toBeUndefined();
    const damage = tickEvents.find((e) => e.type === 'DamageApplied');
    expect(damage).toBeDefined();
    expect(damage!.components.some((c) => c.type === 'slashing')).toBe(true);
  });

  it('Hunger of Hadar fires only the trigger-matched mechanic per call', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const caster = buildCaster('hunger-of-hadar');
    const target = buildTarget();
    let campaign = engine.createCampaign({ name: 'hoh' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'hunger-of-hadar',
      slotLevel: 3,
      targetIds: [],
    }).events;
    campaign = commit(campaign, castEvents);

    // on-enter: cold damage, no save
    const onEnter = engine.plan.tickAura(campaign.state, {
      casterId: caster.id,
      targetIds: [target.id],
      trigger: 'on-enter',
    }).events;
    const enterDamage = onEnter.find((e) => e.type === 'DamageApplied');
    expect(enterDamage).toBeDefined();
    expect(enterDamage!.components.some((c) => c.type === 'cold')).toBe(true);
    expect(onEnter.find((e) => e.type === 'SaveRolled')).toBeUndefined();
    expect(
      onEnter.find((e) => e.type === 'DamageApplied' && e.components.some((c) => c.type === 'acid')),
    ).toBeUndefined();

    // on-turn-end: acid damage with DEX save
    const onTurnEnd = engine.plan.tickAura(campaign.state, {
      casterId: caster.id,
      targetIds: [target.id],
      trigger: 'on-turn-end',
    }).events;
    expect(onTurnEnd.find((e) => e.type === 'SaveRolled')).toBeDefined();
    expect(
      onTurnEnd.find((e) => e.type === 'DamageApplied' && e.components.some((c) => c.type === 'cold')),
    ).toBeUndefined();
  });

  it('Wall of Fire deals fire damage on tick (with optional half on success)', () => {
    let proven = false;
    for (let seed = 1; seed < 60 && !proven; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const caster = buildCaster('wall-of-fire');
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'wof' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const castEvents = engine.plan.castSpell(campaign.state, {
        characterId: caster.id,
        spellId: 'wall-of-fire',
        slotLevel: 4,
        targetIds: [],
      }).events;
      campaign = commit(campaign, castEvents);

      const tickEvents = engine.plan.tickAura(campaign.state, {
        casterId: caster.id,
        targetIds: [target.id],
      }).events;
      const damage = tickEvents.find((e) => e.type === 'DamageApplied');
      if (damage === undefined) continue;
      // We observed damage on at least one seed; confirm it's fire.
      expect(damage.components.some((c) => c.type === 'fire')).toBe(true);
      // No condition is emitted for wall-of-fire.
      const condApplied = tickEvents.find((e) => e.type === 'ConditionApplied');
      expect(condApplied).toBeUndefined();
      proven = true;
    }
    expect(proven, 'no damage observed in seed search').toBe(true);
  });
});
