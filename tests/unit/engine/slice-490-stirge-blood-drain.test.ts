// Slice 490: Stirge Blood Drain.
//
// RAW (SRD 5.2.1 Stirge, CR 1/8): "Proboscis. Melee Attack Roll: +5,
// reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage, and the stirge attaches
// to the target. While attached, the stirge can't make Proboscis
// attacks, and the target takes 5 (2d4) Necrotic damage at the start
// of each of the stirge's turns. The stirge can detach itself by
// spending 5 feet of its movement. The target or a creature within 5
// feet of it can detach the stirge as an action."
//
// Engine additions:
//   - planStirgeDrain (consumer-called at stirge turn-start): emits a
//     DamageApplied for 2d4 necrotic on the stirge's attached target.
//   - planDetachStirge (consumer-called by the target or an ally): emits
//     ConditionRemoved for the stirge-attached condition + consumes an
//     action when invoked by the active combatant in an active encounter.
//   - resolveAttack gate: a stirge with an attached target cannot make
//     Proboscis attacks.
//   - findStirgeAttachedTarget helper.
//
// Content additions:
//   - `stirge-attached` marker condition with `sourceCharacterId`
//     pointing at the attaching stirge.
//   - `stirge-proboscis` weapon (1d6 piercing + onHit applyConditionId
//     'stirge-attached').
//
// Documented RAW deviation (consumer-managed): the "spend 5 feet of
// movement to detach" arm. Same shape as Disengage's fixed-cost
// movement substitution; engine doesn't yet model fractional
// movement-action costs.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  DamageAppliedEvent,
} from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildStirge = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Stirge',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'stirge',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 4, DEX: 16, CON: 11, INT: 2, WIS: 8, CHA: 6 },
    hp: { current: 5, max: 5, temp: 0 },
  });

const buildHero = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Stirge Blood Drain (slice 490)', () => {
  it('stirge-proboscis is a 1d6 piercing weapon with an onHit applyConditionId stirge-attached', () => {
    const w = PACK.items.find((i) => i.id === 'stirge-proboscis');
    expect(w).toBeDefined();
    if (!w || w.itemKind !== 'weapon') throw new Error('stirge-proboscis missing');
    expect(w.damageDice).toBe('1d6');
    expect(w.damageType).toBe('piercing');
    expect(w.onHit).toEqual([{ applyConditionId: 'stirge-attached' }]);
  });

  it('stirge-attached condition is a marker (no effects) with the slice-490 shape', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'stirge-attached');
    expect(c).toBeDefined();
    expect(c?.effects).toEqual([]);
    expect(c?.stackable).toBe(false);
  });

  it('a stirge hit attaches the stirge to the target (ConditionApplied with sourceCharacterId = stirge)', () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const probo = makeItemInstance('stirge-proboscis');
      const stirge = buildStirge();
      const hero = buildHero();
      let campaign: Campaign = engine.createCampaign({ name: `attach-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: probo },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stirge } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: stirge.id,
        targetId: hero.id,
        weaponInstanceId: probo.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as { hit?: boolean } | undefined;
      if (attack?.hit !== true) continue;
      const applied = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'stirge-attached',
      ) as ConditionAppliedEvent | undefined;
      expect(applied).toBeDefined();
      expect(applied?.targetId).toBe(hero.id);
      expect(applied?.sourceCharacterId).toBe(stirge.id);
      return;
    }
    throw new Error('Stirge never landed across 30 seeds');
  });

  it('a stirge that has attached cannot make Proboscis attacks', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    const probo = makeItemInstance('stirge-proboscis');
    const stirge = buildStirge();
    const hero = buildHero();
    const heroWithAttached: Character = {
      ...hero,
      appliedConditions: [{
        id: newAppliedConditionId(),
        conditionId: 'stirge-attached',
        sourceCharacterId: stirge.id,
      }],
    };
    let campaign: Campaign = engine.createCampaign({ name: 'attached-blocked' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: probo },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stirge } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: heroWithAttached } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.attack(campaign.state, {
        attackerId: stirge.id,
        targetId: heroWithAttached.id,
        weaponInstanceId: probo.id,
      }),
    ).toThrow(/cannot make Proboscis attacks while attached/i);
  });

  it('planStirgeDrain emits DamageApplied (2d4 necrotic) on the attached target', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(11) });
    const stirge = buildStirge();
    const hero = buildHero();
    const heroWithAttached: Character = {
      ...hero,
      appliedConditions: [{
        id: newAppliedConditionId(),
        conditionId: 'stirge-attached',
        sourceCharacterId: stirge.id,
      }],
    };
    let campaign: Campaign = engine.createCampaign({ name: 'drain' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stirge } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: heroWithAttached } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.stirgeDrain(campaign.state, { stirgeId: stirge.id }).events;
    const damage = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    expect(damage).toBeDefined();
    expect(damage?.targetId).toBe(heroWithAttached.id);
    expect(damage?.sourceCharacterId).toBe(stirge.id);
    expect(damage?.components[0]?.type).toBe('necrotic');
    // 2d4 range: 2-8 raw; mitigation may modify but the hero has no
    // necrotic resistance/immunity here, so the damage is in range.
    expect(damage?.components[0]?.amount).toBeGreaterThanOrEqual(2);
    expect(damage?.components[0]?.amount).toBeLessThanOrEqual(8);
  });

  it('planStirgeDrain throws when the stirge is not attached to any target', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(13) });
    const stirge = buildStirge();
    const hero = buildHero();
    let campaign: Campaign = engine.createCampaign({ name: 'no-attach' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stirge } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    expect(() => engine.plan.stirgeDrain(campaign.state, { stirgeId: stirge.id })).toThrow(
      /not attached/i,
    );
  });

  it('planDetachStirge removes the stirge-attached condition; stirge can then attack again', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(17) });
    const probo = makeItemInstance('stirge-proboscis');
    const stirge = buildStirge();
    const hero = buildHero();
    const heroWithAttached: Character = {
      ...hero,
      appliedConditions: [{
        id: newAppliedConditionId(),
        conditionId: 'stirge-attached',
        sourceCharacterId: stirge.id,
      }],
    };
    let campaign: Campaign = engine.createCampaign({ name: 'detach' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: probo },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stirge } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: heroWithAttached } satisfies CharacterCreatedEvent,
    ]);
    const detachEvents = engine.plan.detachStirge(campaign.state, {
      actorId: heroWithAttached.id,
      stirgeId: stirge.id,
    }).events;
    const removed = detachEvents.find(
      (e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'stirge-attached',
    );
    expect(removed).toBeDefined();
    campaign = commit(campaign, detachEvents);
    // The stirge can now attack again.
    expect(() =>
      engine.plan.attack(campaign.state, {
        attackerId: stirge.id,
        targetId: heroWithAttached.id,
        weaponInstanceId: probo.id,
      }),
    ).not.toThrow();
  });

  it('Stirge statblock has no traits (Blood Drain is wired entirely on the weapon + condition + planners)', () => {
    const s = PACK.monsters.find((m) => m.id === 'stirge');
    expect(s).toBeDefined();
    // The slice-490 wiring lives on the Proboscis weapon + the stirge-attached
    // condition + the new planners, not as a Custom-marker statblock trait.
    // The statblock keeps `traits: []` so no audit allowlist entry is needed.
    expect(s?.traits ?? []).toEqual([]);
  });
});
