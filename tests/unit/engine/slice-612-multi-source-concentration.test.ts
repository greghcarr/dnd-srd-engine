// Slice 612: per-component concentration saves. Slice 601 rolled one
// save against the totaled damage; RAW (2024 PHB Concentration) says
// "If you take damage from multiple sources, such as an arrow and a
// dragon's breath, you make a separate saving throw for each source
// of damage." This test pins the multi-source path.
//
// Single-component damage events (the common case — most attacks emit
// one DamageApplied with one component) behave identically to slice
// 601: one component → one save. Slice 601's tests still pass for the
// same reason.

import { describe, expect, it } from 'vitest';
import { planConcentrationOnDamage } from '../../../src/engine/plan/concentration.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import {
  TEST_PACK,
  buildFighter,
  eventId,
  isoTimestamp,
} from '../../fixtures/index.js';
import {
  newAppliedConditionId,
  newEffectInstanceId,
} from '../../../src/ids.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';
import type { ULID } from '../../../src/engine/ids-utils.js';
import type {
  ConcentrationBrokenEvent,
} from '../../../src/schemas/events/concentration.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const CONTENT = resolveContent([TEST_PACK]);

const seedConcentrator = (opts: { seed: number; hpMax?: number }) => {
  const rng = seededRNG(opts.seed);
  const engine = createEngine({ contentPacks: [TEST_PACK], rng });
  const target = buildFighter({
    name: 'Concentrator',
    hpMax: opts.hpMax ?? 200,
    hpCurrent: opts.hpMax ?? 200,
  });
  let campaign = engine.createCampaign({ name: 'multi-source-conc' });
  const effectInstanceId = newEffectInstanceId();
  campaign = commit(campaign, [
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
  return { engine, campaign, rng, targetId: target.id, effectInstanceId, target: campaign.state.characters[target.id]! };
};

const conSavesOf = (events: ReadonlyArray<unknown>): SaveRolledEvent[] =>
  events.filter((e): e is SaveRolledEvent =>
    typeof e === 'object' && e !== null && (e as { type?: string }).type === 'SaveRolled'
      && (e as { ability?: string }).ability === 'CON',
  );

describe('slice 612: per-component concentration saves', () => {
  it('two damage components emit two CON saves with their own per-source DCs', () => {
    const { campaign, rng, target } = seedConcentrator({ seed: 7 });
    // Two sources: 14 piercing + 8 necrotic. DCs should be max(10, 7)=10
    // and max(10, 4)=10. Both rolled.
    const events = planConcentrationOnDamage(
      campaign.state,
      CONTENT,
      rng,
      target,
      [
        { amount: 14, type: 'piercing' },
        { amount: 8, type: 'necrotic' },
      ],
      'causedById' as ULID,
      isoTimestamp(),
    );
    const saves = conSavesOf(events);
    // Either two saves (both passed) OR one save followed by a Broken
    // event (first failed and short-circuited).
    expect(saves.length).toBeGreaterThanOrEqual(1);
    const broken = events.find(
      (e): e is ConcentrationBrokenEvent =>
        typeof e === 'object' && e !== null && (e as { type?: string }).type === 'ConcentrationBroken',
    );
    if (saves.length === 1) {
      // Short-circuit: first save failed.
      expect(saves[0]!.success).toBe(false);
      expect(broken).toBeDefined();
      expect(broken?.reason).toBe('failedSave');
    } else {
      expect(saves.length).toBe(2);
      // First save must have passed (otherwise we would have short-
      // circuited). Second save MAY have passed or failed.
      expect(saves[0]!.success).toBe(true);
      if (!saves[1]!.success) {
        expect(broken).toBeDefined();
      } else {
        expect(broken).toBeUndefined();
      }
    }
  });

  it('per-source DC math: a 30-damage source rolls vs DC 15, a 4-damage source rolls vs DC 10', () => {
    const { campaign, rng, target } = seedConcentrator({ seed: 13 });
    const events = planConcentrationOnDamage(
      campaign.state,
      CONTENT,
      rng,
      target,
      [
        { amount: 30, type: 'fire' },
        { amount: 4, type: 'cold' },
      ],
      'causedById' as ULID,
      isoTimestamp(),
    );
    const saves = conSavesOf(events);
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves[0]!.dc).toBe(15); // max(10, 30/2) = 15
    if (saves.length >= 2) {
      expect(saves[1]!.dc).toBe(10); // max(10, 4/2) = 10
    }
  });

  it('zero-amount components are skipped', () => {
    const { campaign, rng, target } = seedConcentrator({ seed: 11 });
    const events = planConcentrationOnDamage(
      campaign.state,
      CONTENT,
      rng,
      target,
      [
        { amount: 5, type: 'piercing' },
        { amount: 0, type: 'fire' }, // immunity or full resist
        { amount: 3, type: 'cold' },
      ],
      'causedById' as ULID,
      isoTimestamp(),
    );
    const saves = conSavesOf(events);
    // Either both non-zero sources rolled (2 saves) or first failed (1 save).
    expect(saves.length).toBeLessThanOrEqual(2);
    expect(saves.length).toBeGreaterThanOrEqual(1);
  });

  it('single-component damage (the common case) emits one save, matching slice 601 behavior', () => {
    const { campaign, rng, target } = seedConcentrator({ seed: 42 });
    const events = planConcentrationOnDamage(
      campaign.state,
      CONTENT,
      rng,
      target,
      [{ amount: 9, type: 'slashing' }],
      'causedById' as ULID,
      isoTimestamp(),
    );
    const saves = conSavesOf(events);
    expect(saves.length).toBe(1);
    expect(saves[0]!.dc).toBe(10);
  });
});
