// Slice 503: Ensnaring Strike (L1 Ranger) - the last L1 spell with a real
// mechanical gap. Compose two small new fields on existing mechanics to
// cover the spell end-to-end.
//
// RAW (SRD 5.2.1 Ensnaring Strike, Bonus Action, Concentration up to 1
// min): "As you hit the target, grasping vines appear on it, and it makes
// a Strength saving throw. A Large or larger creature has Advantage on
// this save. On a failed save, the target has the Restrained condition
// until the spell ends... While Restrained, the target takes 1d6 Piercing
// damage at the start of each of its turns... The damage increases by 1d6
// for each spell slot level above 1."
//
// Engine additions (slice 503):
//   - `save.largeCreatureAdvantage`: targets of size Large+ gain advantage
//     on the save.
//   - `recurring.extraDicePerSlotLevel`: per-tick upcast scaling, read
//     from the bound EffectInstance's `slotLevel`.
//
// Documented RAW deviations (consumer-managed):
//   - "Casting Time: Bonus Action, immediately after hitting a creature
//     with a weapon": the engine doesn't track recent hits; the consumer
//     invokes the cast after observing AttackRolled.hit.
//   - The Athletics-action escape (target or ally in reach takes an action
//     to make a STR (Athletics) check vs the spell save DC): consumer-
//     driven via `engine.plan.abilityCheck` + a ConditionRemoved on success.
//   - "On a successful save, the vines shrivel away, and the spell ends":
//     not modeled. Concentration stays up on a successful save (the
//     mechanic's success arm doesn't currently lift caster concentration).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { replay } from '../../../src/engine/replay.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildRanger = (level = 5): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ranger',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'ranger', level, hitDiceRemaining: level }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
    knownSpells: ['ensnaring-strike'],
    preparedSpells: ['ensnaring-strike'],
  });

// A Medium target with low STR so it tends to fail the save.
const buildWolf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Wolf',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'wolf',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6 },
    hp: { current: 11, max: 11, temp: 0 },
  });

// A Large target so the save gains advantage.
const buildOgre = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Ogre',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'ogre',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7 },
    hp: { current: 59, max: 59, temp: 0 },
  });

describe('Ensnaring Strike (slice 503)', () => {
  it('ships a STR save (restrained-on-fail, Large+ advantage) + 1d6 piercing recurring damage with +1d6/slot upcast', () => {
    const s = PACK.spells.find((sp) => sp.id === 'ensnaring-strike');
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'save', ability: 'STR', conditionOnFail: 'restrained', largeCreatureAdvantage: true },
      { kind: 'recurring', effect: 'damage', amountDice: '1d6', damageType: 'piercing', extraDicePerSlotLevel: 1 },
    ]);
  });

  it('a Medium target that fails the STR save gets Restrained (bound to the cast concentration)', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const ranger = buildRanger();
      const wolf = buildWolf();
      let campaign: Campaign = engine.createCampaign({ name: `es-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: ranger.id,
        spellId: 'ensnaring-strike',
        slotLevel: 1,
        targetIds: [wolf.id],
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save?.ability).toBe('STR');
      // A Medium target gets no size advantage.
      expect(save?.used).toBe('none');
      if (save?.success === true) continue; // need a failed seed for the restrained assertion
      const restrained = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'restrained',
      ) as ConditionAppliedEvent | undefined;
      expect(restrained).toBeDefined();
      expect(restrained?.targetId).toBe(wolf.id);
      // Concentration-bound: the ConcentrationStarted event lists the
      // applied restrained, so concentration-drop cleanup lifts it.
      const started = events.find((e) => e.type === 'ConcentrationStarted') as
        | { conditionsApplied: ReadonlyArray<{ targetId: string; conditionId: string }> }
        | undefined;
      expect(started).toBeDefined();
      expect(
        started?.conditionsApplied.some(
          (c) => c.conditionId === 'restrained' && c.targetId === wolf.id,
        ),
      ).toBe(true);
      return;
    }
    throw new Error('no failed-save seed across 60 tries');
  });

  it('a Large target gets advantage on the STR save (two d20s, used: advantage)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const ranger = buildRanger();
    const ogre = buildOgre();
    let campaign: Campaign = engine.createCampaign({ name: 'es-ogre' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ogre } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: ranger.id,
      spellId: 'ensnaring-strike',
      slotLevel: 1,
      targetIds: [ogre.id],
    }).events;
    const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
    expect(save?.ability).toBe('STR');
    expect(save?.used).toBe('advantage');
    expect(save?.d20.length).toBe(2);
  });

  it('after Restrained is applied, tickRecurring against the target deals 1d6 piercing', () => {
    // Drive a failing-save seed for the wolf, commit the cast events,
    // then tick: assert one DamageApplied of type piercing, 1..6 damage.
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const ranger = buildRanger();
      const wolf = buildWolf();
      let campaign: Campaign = engine.createCampaign({ name: `es-tick-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
      ]);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: ranger.id,
        spellId: 'ensnaring-strike',
        slotLevel: 1,
        targetIds: [wolf.id],
      }).events;
      const save = cast.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success !== false) continue;
      campaign = commit(campaign, cast);
      const tick = engine.plan.tickRecurring(campaign.state, {
        casterId: ranger.id,
        targetId: wolf.id,
      }).events;
      const damage = tick.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      expect(damage).toBeDefined();
      const piercing = damage!.components.find((c) => c.type === 'piercing');
      expect(piercing).toBeDefined();
      expect(piercing!.amount).toBeGreaterThanOrEqual(1);
      expect(piercing!.amount).toBeLessThanOrEqual(6);
      return;
    }
    throw new Error('no failed-save seed across 60 tries');
  });

  it('upcasting at slot 2 makes each tick deal 2d6 piercing (range 2..12)', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const ranger = buildRanger();
      const wolf = buildWolf();
      let campaign: Campaign = engine.createCampaign({ name: `es-upcast-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
      ]);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: ranger.id,
        spellId: 'ensnaring-strike',
        slotLevel: 2,
        targetIds: [wolf.id],
      }).events;
      const save = cast.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success !== false) continue;
      campaign = commit(campaign, cast);
      const tick = engine.plan.tickRecurring(campaign.state, {
        casterId: ranger.id,
        targetId: wolf.id,
      }).events;
      const damage = tick.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
      const piercing = damage!.components.find((c) => c.type === 'piercing');
      expect(piercing!.amount).toBeGreaterThanOrEqual(2);
      expect(piercing!.amount).toBeLessThanOrEqual(12);
      return;
    }
    throw new Error('no failed-save seed across 60 tries');
  });

  it('the cast + tick chain replays equivalently', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const ranger = buildRanger();
      const wolf = buildWolf();
      let campaign: Campaign = engine.createCampaign({ name: `es-replay-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
      ]);
      const cast = engine.plan.castSpell(campaign.state, {
        characterId: ranger.id,
        spellId: 'ensnaring-strike',
        slotLevel: 1,
        targetIds: [wolf.id],
      }).events;
      const save = cast.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save?.success !== false) continue;
      campaign = commit(campaign, cast);
      const tick = engine.plan.tickRecurring(campaign.state, {
        casterId: ranger.id,
        targetId: wolf.id,
      }).events;
      const after = commit(campaign, tick);
      expect(replay(after.events)).toEqual(after.state);
      return;
    }
    throw new Error('no failed-save seed across 60 tries');
  });
});
