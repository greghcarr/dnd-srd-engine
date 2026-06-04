// Slice 601: every DamageApplied to a concentrating creature now
// triggers an auto CON save (DC max(10, half-damage)). On failure the
// concentration breaks with reason='failedSave'; on success the spell
// keeps ticking. This pins the new RAW path that the fuzz tool's 15-
// battle audit surfaced as missing — Faerie Fire, Bless, Hex etc.
// previously stayed up indefinitely under chip damage.

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
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const seedConcentratingTarget = (opts: { targetHp: number; seed: number }) => {
  const rng = seededRNG(opts.seed);
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
  let campaign = engine.createCampaign({ name: 'conc-on-damage' });
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

describe('slice 601: concentration CON save on every non-fatal DamageApplied', () => {
  it('emits a SaveRolled (ability=CON, isConcentrationCheck) when a concentrating target takes non-fatal damage', () => {
    // High HP so the hit doesn't drop them — partial-damage path is the
    // one being pinned here.
    for (let seed = 0; seed < 50; seed += 1) {
      const { engine, campaign, attackerId, targetId, weaponId } =
        seedConcentratingTarget({ targetHp: 200, seed });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      const damage = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
      if (!damage) continue;
      const conSaves = events.filter(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'CON',
      );
      // RAW: every damage event → one CON save. A single attack emits a
      // single DamageApplied, so a single CON save fires.
      expect(conSaves.length).toBe(1);
      const total = damage.components.reduce((s, c) => s + c.amount, 0);
      const expectedDC = Math.max(10, Math.floor(total / 2));
      expect(conSaves[0]!.dc).toBe(expectedDC);
      return;
    }
    throw new Error('No seed produced a DamageApplied event in 50 tries');
  });

  it('emits ConcentrationBroken (failedSave) when the CON save fails', () => {
    // Sweep many seeds; some will produce a failed save.
    for (let seed = 0; seed < 200; seed += 1) {
      const { engine, campaign, attackerId, targetId, weaponId, effectInstanceId } =
        seedConcentratingTarget({ targetHp: 200, seed });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      const save = events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'CON',
      );
      if (!save || save.success) continue;
      const broken = events.find(
        (e): e is ConcentrationBrokenEvent => e.type === 'ConcentrationBroken',
      );
      expect(broken).toBeDefined();
      expect(broken?.reason).toBe('failedSave');
      expect(broken?.effectInstanceId).toBe(effectInstanceId);
      expect(broken?.causedByEventId).toBe(save.id);
      return;
    }
    throw new Error('No seed produced a failed CON save in 200 tries');
  });

  it('does not emit ConcentrationBroken when the CON save succeeds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { engine, campaign, attackerId, targetId, weaponId } =
        seedConcentratingTarget({ targetHp: 200, seed });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      const save = events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'CON',
      );
      if (!save || !save.success) continue;
      const broken = events.find(
        (e): e is ConcentrationBrokenEvent => e.type === 'ConcentrationBroken',
      );
      expect(broken).toBeUndefined();
      return;
    }
    throw new Error('No seed produced a successful CON save in 200 tries');
  });

  it('skips the save when damage would drop to 0 (unconscious path emits directly)', () => {
    // Tiny HP guarantees drop-to-0. Slice 601 keeps the legacy
    // unconscious-immediate-break path: no CON save, just ConcentrationBroken.
    for (let seed = 0; seed < 50; seed += 1) {
      const { engine, campaign, attackerId, targetId, weaponId } =
        seedConcentratingTarget({ targetHp: 1, seed });
      const { events } = engine.plan.attack(campaign.state, {
        attackerId,
        targetId,
        weaponInstanceId: weaponId,
      });
      const damage = events.find((e) => e.type === 'DamageApplied');
      if (!damage) continue;
      const conSaves = events.filter(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && e.ability === 'CON',
      );
      const broken = events.find(
        (e): e is ConcentrationBrokenEvent => e.type === 'ConcentrationBroken',
      );
      expect(conSaves.length).toBe(0);
      expect(broken).toBeDefined();
      expect(broken?.reason).toBe('unconscious');
      return;
    }
    throw new Error('No seed produced a drop-to-0 attack in 50 tries');
  });
});
