// Slice 484: Worg Bite "next attack vs target gets Advantage" rider.
//
// RAW (SRD 5.2.1 Worg, CR 1/2): "Bite. Melee Attack Roll: +5, reach 5
// ft. Hit: 7 (1d8 + 3) Piercing damage, and the next attack roll made
// against the target before the start of the worg's next turn has
// Advantage."
//
// Engine additions:
//   - `consumeOnIncomingAttack` (target-side mirror of `consumeOnAttack`):
//     after the bearer is attacked, the resolver removes any
//     consumeOnIncomingAttack condition it carries.
//   - `applyRiderCondition` now stamps `expiresOnRound`/`expiryTrigger`
//     from the condition's `autoExpiry` when inside an active encounter,
//     so the buff lifts at start of worg's next turn if no incoming
//     attack happens.
//
// Content additions:
//   - `worg-bite-targeted` condition: GrantAdvantageToAttackers,
//     consumeOnIncomingAttack: true, autoExpiry afterRounds 1 turnStart.
//   - `worg-bite` natural weapon: 1d8 piercing + onHit applyConditionId
//     `worg-bite-targeted`.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildWorg = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Worg',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'worg',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 13, CON: 13, INT: 7, WIS: 11, CHA: 8 },
    hp: { current: 26, max: 26, temp: 0 },
  });

const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Worg Ally',
    speciesId: 'companion',
    backgroundId: 'companion',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Worg Bite next-attack-vs-target advantage rider (slice 484)', () => {
  it('worg-bite weapon is 1d8 piercing with an onHit applyConditionId worg-bite-targeted', () => {
    const w = PACK.items.find((i) => i.id === 'worg-bite');
    expect(w).toBeDefined();
    if (!w || w.itemKind !== 'weapon') throw new Error('worg-bite missing');
    expect(w.damageDice).toBe('1d8');
    expect(w.damageType).toBe('piercing');
    expect(w.onHit).toEqual([{ applyConditionId: 'worg-bite-targeted' }]);
  });

  it('worg-bite-targeted condition declares the slice-484 shape', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'worg-bite-targeted');
    expect(c).toBeDefined();
    expect(c?.effects).toEqual([{ kind: 'GrantAdvantageToAttackers' }]);
    expect(c?.consumeOnIncomingAttack).toBe(true);
    expect(c?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnStart' });
  });

  it('on hit, the worg-bite applies worg-bite-targeted to the target', () => {
    // Try a few seeds to find one where the worg hits.
    for (let seed = 1; seed < 30; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const bite = makeItemInstance('worg-bite');
      const worg = buildWorg();
      const target = buildTarget('Hero');
      let campaign = engine.createCampaign({ name: `worg-hit-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bite },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: worg } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: worg.id,
        targetId: target.id,
        weaponInstanceId: bite.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const applied = events.find(
        (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'worg-bite-targeted',
      ) as ConditionAppliedEvent | undefined;
      expect(applied).toBeDefined();
      expect(applied?.targetId).toBe(target.id);
      expect(applied?.sourceCharacterId).toBe(worg.id);
      return;
    }
    throw new Error('worg-bite never landed across 30 seeds');
  });

  it('an attack against a target carrying worg-bite-targeted rolls with Advantage and consumes the condition', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(11) });
    const ally = buildAlly();
    const sword = makeItemInstance('shortsword');
    const target = buildTarget('Hero');
    // Hand-apply the condition to bypass the worg-bite-hit dependency.
    const targetWithBuff: Character = {
      ...target,
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'worg-bite-targeted' }],
    };
    let campaign = engine.createCampaign({ name: 'ally-attack' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: targetWithBuff } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: ally.id,
      targetId: targetWithBuff.id,
      weaponInstanceId: sword.id,
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
    expect(attack?.used).toBe('advantage');
    expect(attack?.d20.length).toBe(2);
    // The condition should be removed from the target.
    const removed = events.find(
      (e) => e.type === 'ConditionRemoved' && (e as { conditionId?: string }).conditionId === 'worg-bite-targeted',
    );
    expect(removed).toBeDefined();
  });

  it('a second attack against the same target (after the first) rolls without Advantage (condition consumed)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(13) });
    const ally = buildAlly();
    const sword = makeItemInstance('shortsword');
    const target = buildTarget('Hero');
    const targetWithBuff: Character = {
      ...target,
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'worg-bite-targeted' }],
    };
    let campaign = engine.createCampaign({ name: 'two-attacks' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: targetWithBuff } satisfies CharacterCreatedEvent,
    ]);
    const firstEvents = engine.plan.attack(campaign.state, {
      attackerId: ally.id,
      targetId: targetWithBuff.id,
      weaponInstanceId: sword.id,
    }).events;
    campaign = commit(campaign, firstEvents);
    // Now the buff should be gone. A second attack rolls normally.
    const secondEvents = engine.plan.attack(campaign.state, {
      attackerId: ally.id,
      targetId: targetWithBuff.id,
      weaponInstanceId: sword.id,
    }).events;
    const secondAttack = secondEvents.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
    expect(secondAttack?.used).toBe('none');
    expect(secondAttack?.d20.length).toBe(1);
  });
});
