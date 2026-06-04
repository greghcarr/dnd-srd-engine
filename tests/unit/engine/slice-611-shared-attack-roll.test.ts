// Slice 611: spell attacks now route through the same shared
// resolveAttackRoll helper as weapon attacks. Side benefits that come
// for free:
//   - Halfling Luck (reroll nat 1)
//   - Bless / Bane bonus dice
//   - Extended crit ranges (Improved Critical)
//   - Melee spell attack auto-crits Paralyzed / Unconscious / HP-0 target
//
// All four were weapon-only pre-slice and were tracked as open follow-
// ups from slice 602. Routing through the shared helper closes the
// attacker-side gap automatically.

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

const STARTER = loadStarterPack();

const seedSpellAttack = (opts: {
  seed: number;
  casterSpecies?: string;
  casterClass?: string;
  casterAbilities?: Partial<{ STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number }>;
  targetConditions?: ReadonlyArray<string>;
  targetHpMax?: number;
  spellId?: string;
}) => {
  const rng = seededRNG(opts.seed);
  const engine = createEngine({ contentPacks: [STARTER], rng });
  const casterBase = buildFighter({ name: 'Caster' });
  const caster = {
    ...casterBase,
    speciesId: opts.casterSpecies ?? casterBase.speciesId,
    knownSpells: [opts.spellId ?? 'fire-bolt'],
    preparedSpells: [opts.spellId ?? 'fire-bolt'],
    classes: [{ classId: opts.casterClass ?? 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { ...casterBase.abilityScores, INT: 16, ...(opts.casterAbilities ?? {}) },
  };
  const target = buildFighter({
    name: 'Target',
    hpMax: opts.targetHpMax ?? 200,
    hpCurrent: opts.targetHpMax ?? 200,
  });
  let campaign = engine.createCampaign({ name: 'shared-attack-roll' });
  const setup: Array<unknown> = [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: caster,
    } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: target,
    } satisfies CharacterCreatedEvent,
  ];
  for (const cond of opts.targetConditions ?? []) {
    setup.push({
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: target.id,
      conditionId: cond,
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
  }
  campaign = commit(campaign, setup as never);
  return { engine, campaign, casterId: caster.id, targetId: target.id };
};

describe('slice 611: spell attacks route through shared resolveAttackRoll', () => {
  it('Halfling caster rolling a nat 1 spell attack triggers Halfling Luck reroll', () => {
    // Halflings carry Halfling Luck which rerolls any nat 1 d20 test
    // once. Pre-slice this was weapon-only; the spell-attack path
    // rolled a bare d20 with no reroll.
    //
    // Sweep seeds until we find one where the initial d20 is a 1.
    // Assert: the AttackRolled event's d20 array has 2+ entries (the
    // reroll was appended) and the used roll is the reroll value.
    for (let seed = 0; seed < 500; seed += 1) {
      const { engine, campaign, casterId, targetId } = seedSpellAttack({
        seed,
        casterSpecies: 'halfling',
      });
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: casterId,
        spellId: 'fire-bolt',
        slotLevel: 0,
        targetIds: [targetId],
      });
      const atk = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (!atk) continue;
      // Look for the Halfling-Luck-reroll case: one initial d20 in
      // the array, no advantage/disadvantage, and the array has
      // grown to 2 entries (the reroll). When the initial d20 was 1
      // the reroll IS appended; otherwise the array stays at 1.
      if (atk.used === 'none' && atk.d20[0] === 1 && atk.d20.length === 2) {
        // The used value is the reroll, not the initial 1.
        const initial = atk.d20[0]!;
        const reroll = atk.d20[1]!;
        expect(initial).toBe(1);
        expect(atk.total).toBe(reroll + atk.attackBonus);
        return;
      }
    }
    throw new Error('No seed produced a Halfling Luck reroll on the spell attack in 500 tries');
  });

  it('melee spell attack against Paralyzed target auto-crits on hit', () => {
    // RAW: "Any attack that hits the creature is a critical hit if the
    // attacker is within 5 feet of the creature" for Paralyzed (et al.).
    // Pre-slice this fired only for weapon attacks; melee spell attacks
    // (Shocking Grasp etc.) didn't auto-crit despite RAW applying.
    //
    // Use Shocking Grasp (melee spell attack) against a Paralyzed
    // target. Sweep seeds; assert the first hit is a crit.
    for (let seed = 0; seed < 100; seed += 1) {
      const { engine, campaign, casterId, targetId } = seedSpellAttack({
        seed,
        spellId: 'shocking-grasp',
        targetConditions: ['paralyzed'],
      });
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: casterId,
        spellId: 'shocking-grasp',
        slotLevel: 0,
        targetIds: [targetId],
      });
      const atk = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (!atk || !atk.hit) continue;
      expect(atk.critical).toBe(true);
      return;
    }
    throw new Error('No seed produced a hit on the Paralyzed target in 100 tries');
  });
});
