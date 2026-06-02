import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import {
  TEST_PACK,
  buildFighter,
  eventId,
  isoTimestamp,
  makeItemInstance,
} from '../../fixtures/index.js';
import {
  newAppliedConditionId,
  newEffectInstanceId,
} from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const seedConcentratingTarget = (opts: { targetHp: number; rng?: ReturnType<typeof seededRNG> }) => {
  const rng = opts.rng ?? seededRNG(42);
  const engine = createEngine({ contentPacks: [TEST_PACK], rng });
  const longsword = makeItemInstance('longsword');
  const armor = makeItemInstance('chain-mail');
  const attacker = buildFighter({ STR: 18 });
  const target = buildFighter({
    name: 'Concentrator',
    hpMax: opts.targetHp,
    hpCurrent: opts.targetHp,
    armorInstanceId: armor.id,
  });
  let campaign = engine.createCampaign({ name: 'conc-drop' });
  const effectInstanceId = newEffectInstanceId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armor },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: attacker,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: target,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationStarted',
      effectInstanceId,
      casterId: target.id,
      spellId: 'bless',
      targetIds: [target.id],
      conditionsApplied: [
        {
          targetId: target.id,
          conditionId: 'blessed',
          appliedConditionId: newAppliedConditionId(),
        },
      ],
    } satisfies ConcentrationStartedEvent,
  ]);
  return {
    engine,
    campaign,
    attackerId: attacker.id,
    targetId: target.id,
    weaponId: longsword.id,
    effectInstanceId,
  };
};

describe('plan.attack: concentration breaks on drop to 0 HP', () => {
  it('emits ConcentrationBroken (reason=unconscious) when an attack drops a concentrating target to 0 HP', () => {
    // Tiny target HP guarantees any hit will drop them.
    const ctx = seedConcentratingTarget({ targetHp: 1, rng: seededRNG(7) });
    let found = false;
    for (let seed = 0; seed < 50; seed++) {
      const { engine, campaign, attackerId, targetId, weaponId, effectInstanceId } =
        seedConcentratingTarget({ targetHp: 1, rng: seededRNG(seed) });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      const hasDamage = events.some((e) => e.type === 'DamageApplied');
      if (!hasDamage) continue;
      const broken = events.find((e) => e.type === 'ConcentrationBroken');
      expect(broken).toBeDefined();
      if (broken?.type === 'ConcentrationBroken') {
        expect(broken.reason).toBe('unconscious');
        expect(broken.effectInstanceId).toBe(effectInstanceId);
        expect(broken.casterId).toBe(targetId);
      }
      found = true;
      break;
    }
    expect(found).toBe(true);
    void ctx; // pacify the unused-let warning
  });

  it('does not emit ConcentrationBroken (unconscious) when target stays conscious', () => {
    // Slice 601: a successful CON save on the per-damage check leaves
    // ConcentrationBroken unemitted. The drop-to-0 path stays the only
    // source of `reason: 'unconscious'`. Sweep seeds until we land on
    // one where the target survives the hit AND succeeds the save, then
    // assert the broken event is absent.
    let found = false;
    for (let seed = 0; seed < 200; seed++) {
      const { engine, campaign, attackerId, targetId, weaponId } =
        seedConcentratingTarget({ targetHp: 200, rng: seededRNG(seed) });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      const damage = events.find((e) => e.type === 'DamageApplied') as
        | DamageAppliedEvent
        | undefined;
      if (!damage) continue;
      const total = damage.components.reduce((s, c) => s + c.amount, 0);
      if (total >= 200) continue;
      const conSave = events.find(
        (e): e is { type: 'SaveRolled'; ability: string; success: boolean } =>
          e.type === 'SaveRolled' && (e as { ability?: string }).ability === 'CON',
      );
      if (conSave === undefined || !conSave.success) continue;
      const broken = events.find((e) => e.type === 'ConcentrationBroken');
      expect(broken).toBeUndefined();
      found = true;
      break;
    }
    expect(found).toBe(true);
  });

  it('applies cleanly: caster.concentrationEffectId becomes undefined after replay', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { engine, campaign, attackerId, targetId, weaponId } =
        seedConcentratingTarget({ targetHp: 1, rng: seededRNG(seed) });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      if (!events.some((e) => e.type === 'ConcentrationBroken')) continue;
      const committed = commit(campaign, events);
      expect(committed.state.characters[targetId]?.concentrationEffectId).toBeUndefined();
      return;
    }
    throw new Error('No seed produced a ConcentrationBroken event in 50 tries');
  });
});
