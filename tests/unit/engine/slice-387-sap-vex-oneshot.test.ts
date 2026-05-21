// Slice 387 - Sap / Vex are one-shot (full-RAW conversion).
//
// RAW: Sap gives the target Disadvantage on its *next* attack roll; Vex
// gives the attacker Advantage on their *next* attack roll against the
// vexed creature. Previously the `sapped` / `vexing-active` conditions
// lasted a full round (autoExpiry), so a second attack the same turn
// (Extra Attack) wrongly kept the advantage/disadvantage. Now the attack
// resolver removes a `consumeOnAttack` condition after the bearer's attack
// roll, so it applies to exactly one attack (autoExpiry still bounds the
// "no attack made" case).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighter = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 12,
  });

const applyCondition = (targetId: string, conditionId: string, sourceId?: string) => ({
  id: eventId(), at: isoTimestamp(), type: 'ConditionApplied' as const,
  targetId: targetId as never, conditionId, appliedConditionId: newAppliedConditionId(),
  ...(sourceId !== undefined ? { sourceCharacterId: sourceId as never } : {}),
});

const usedOf = (events: ReadonlyArray<Event>): string | undefined =>
  (events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.used;
const removedConditions = (events: ReadonlyArray<Event>): string[] =>
  events.filter((e) => e.type === 'ConditionRemoved').map((e) => (e as { conditionId: string }).conditionId);

describe('slice 387: Sap is consumed by the next attack', () => {
  it('a Sapped creature attacks with Disadvantage once, then normally', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const attacker = buildFighter('Sapped One');
    const target = buildFighter('Foe');
    const sword = makeItemInstance('longsword');
    let campaign: Campaign = engine.createCampaign({ name: 'sap' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      applyCondition(attacker.id, 'sapped'),
    ]);
    // First attack: Disadvantage, and sapped is removed.
    const first = engine.plan.attack(campaign.state, {
      attackerId: attacker.id, targetId: target.id, weaponInstanceId: sword.id,
    }).events as ReadonlyArray<Event>;
    expect(usedOf(first)).toBe('disadvantage');
    expect(removedConditions(first)).toContain('sapped');
    // Commit, then a second attack is unaffected.
    campaign = commit(campaign, first);
    const second = engine.plan.attack(campaign.state, {
      attackerId: attacker.id, targetId: target.id, weaponInstanceId: sword.id,
    }).events as ReadonlyArray<Event>;
    expect(usedOf(second)).toBe('none');
  });
});

describe('slice 387: Vex is consumed by the next attack against the vexed target', () => {
  const setup = () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const vexer = buildFighter('Vexer');
    const target = buildFighter('Vexed');
    const other = buildFighter('Bystander');
    const sword = makeItemInstance('longsword');
    let campaign: Campaign = engine.createCampaign({ name: 'vex' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: vexer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: other } satisfies CharacterCreatedEvent,
      applyCondition(vexer.id, 'vexing-active', target.id),
    ]);
    return { engine, campaign, vexerId: vexer.id, targetId: target.id, otherId: other.id, swordId: sword.id };
  };

  it('attacking the vexed target gives Advantage once, then normally', () => {
    const s = setup();
    const first = s.engine.plan.attack(s.campaign.state, {
      attackerId: s.vexerId, targetId: s.targetId, weaponInstanceId: s.swordId,
    }).events as ReadonlyArray<Event>;
    expect(usedOf(first)).toBe('advantage');
    expect(removedConditions(first)).toContain('vexing-active');
    const after = commit(s.campaign, first);
    const second = s.engine.plan.attack(after.state, {
      attackerId: s.vexerId, targetId: s.targetId, weaponInstanceId: s.swordId,
    }).events as ReadonlyArray<Event>;
    expect(usedOf(second)).toBe('none');
  });

  it('attacking a different creature neither gains Advantage nor consumes the Vex', () => {
    const s = setup();
    const vsOther = s.engine.plan.attack(s.campaign.state, {
      attackerId: s.vexerId, targetId: s.otherId, weaponInstanceId: s.swordId,
    }).events as ReadonlyArray<Event>;
    expect(usedOf(vsOther)).toBe('none');
    expect(removedConditions(vsOther)).not.toContain('vexing-active');
  });
});
