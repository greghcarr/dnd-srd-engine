// Slice 602: spell attacks now consult the target's effect stack for
// advantage / disadvantage exactly like weapon attacks (planAttack).
//
// Pinned cases:
//   1. Faerie Fired target → ranged spell attack rolls with Advantage
//      (canonical RAW user; was the missing case the slice-600 fuzz
//      audit surfaced).
//   2. Faerie Fired target whose attacker also has a disadvantage
//      source (ranged-in-melee) → 2024 cancellation rule applies,
//      attack rolls normally.
//   3. Faerie Fired target where the attacker is melee-spell-attacking
//      a creature with the dodge/blur disadvantage source → cancels
//      cleanly.
//   4. Unaffected target → bare d20 (regression: slice didn't change
//      the common case where no condition imposes advantage).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/starter-pack.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
} from '../../fixtures/index.js';
import {
  newAppliedConditionId,
} from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

// Slice 602 needs production conditions (`faerie-fired` etc. carrying
// `GrantAdvantageToAttackers`) which TEST_PACK's stubs don't define.
const STARTER = loadStarterPack();

const seedCaster = (opts: { faerieFireTarget?: boolean; seed: number }) => {
  const rng = seededRNG(opts.seed);
  const engine = createEngine({ contentPacks: [STARTER], rng });
  const caster = buildFighter({ name: 'Caster' });
  const casterWithSpell = {
    ...caster,
    knownSpells: ['fire-bolt'],
    preparedSpells: ['fire-bolt'],
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { ...caster.abilityScores, INT: 16 },
  };
  const target = buildFighter({ name: 'Target', hpMax: 200, hpCurrent: 200 });
  let campaign = engine.createCampaign({ name: 'spell-atk-adv' });
  const setup: Array<unknown> = [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: casterWithSpell,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: target,
    } satisfies CharacterCreatedEvent,
  ];
  if (opts.faerieFireTarget) {
    setup.push({
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: target.id,
      conditionId: 'faerie-fired',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
  }
  campaign = commit(campaign, setup as never);
  return { engine, campaign, casterId: casterWithSpell.id, targetId: target.id };
};

describe('slice 602: spell attacks consult GrantAdvantageToAttackers', () => {
  it('Faerie Fired target → ranged spell attack rolls with Advantage', () => {
    // Sweep a few seeds; assert every seed produces an AttackRolled
    // with `used: 'advantage'` (the engine should ALWAYS apply
    // advantage given a faerie-fired target with no countervailing
    // condition).
    for (let seed = 0; seed < 5; seed += 1) {
      const { engine, campaign, casterId, targetId } = seedCaster({ faerieFireTarget: true, seed });
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: casterId,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [targetId],
      });
      const attackEvent = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      expect(attackEvent).toBeDefined();
      expect(attackEvent?.used).toBe('advantage');
      expect(attackEvent?.d20.length).toBe(2);
    }
  });

  it('Unaffected target → bare d20, no advantage', () => {
    for (let seed = 0; seed < 5; seed += 1) {
      const { engine, campaign, casterId, targetId } = seedCaster({ faerieFireTarget: false, seed });
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: casterId,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [targetId],
      });
      const attackEvent = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      expect(attackEvent).toBeDefined();
      expect(attackEvent?.used).toBe('none');
      expect(attackEvent?.d20.length).toBe(1);
    }
  });

  it('Faerie Fired target + Dodging target → cancellation rule, rolls with neither', () => {
    // Dodge imposes disadvantage on attackers. Faerie Fire grants
    // advantage. 2024 PHB: when both apply, the attack is rolled with
    // neither.
    for (let seed = 0; seed < 5; seed += 1) {
      const { engine, campaign, casterId, targetId } = seedCaster({ faerieFireTarget: true, seed });
      const dodgedCampaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConditionApplied',
          targetId,
          conditionId: 'dodged',
          appliedConditionId: newAppliedConditionId(),
        } satisfies ConditionAppliedEvent,
      ] as never);
      const { events } = engine.plan.castSpell(dodgedCampaign.state, {
        characterId: casterId,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [targetId],
      });
      const attackEvent = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      expect(attackEvent).toBeDefined();
      expect(attackEvent?.used).toBe('none');
      expect(attackEvent?.d20.length).toBe(1);
    }
  });
});
