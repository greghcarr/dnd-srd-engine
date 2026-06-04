// Slice 648: Monk L3 Deflect Attacks.
//
// RAW (SRD 5.2.1 Monk L3): "When an attack roll hits you and its
// damage includes Bludgeoning, Piercing, or Slashing damage, you can
// take a Reaction to reduce the attack's total damage against you.
// The reduction equals 1d10 plus your Dexterity modifier and Monk
// level."
//
// planDeflectAttacks is a reaction-style planner returning a
// DeflectAttacksOutcome (reduction + remainingDamage). Mirrors the
// uncannyDodge / cuttingWords / shield pattern: the consumer reads
// the outcome and integrates with their pending damage.
//
// Counter arm (RAW: "If you reduce the damage to 0, you can expend
// 1 Focus Point to redirect some of the attack's force") is deferred
// to a follow-up slice — the core reduction arm is what closes the
// L3 floor xfail.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEventId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DeflectAttacksUsedEvent, ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';

const PACK = loadStarterPack();

const buildMonk = (level: number = 3, dex: number = 16): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Nivix',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 12, DEX: dex, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const buildAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bandit',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const startEncounter = (
  monk: Character,
  attacker: Character,
  seed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign = engine.createCampaign({ name: 'deflect-attacks' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
  ]);
  const create = engine.plan.createEncounter(campaign.state, { combatantIds: [monk.id, attacker.id] });
  campaign = commit(campaign, create.events);
  const enc = Object.values(campaign.state.encounters)[0]!;
  const init = engine.plan.rollInitiative(campaign.state, { encounterId: enc.id });
  campaign = commit(campaign, init.events);
  const start = engine.plan.startEncounter(campaign.state, { encounterId: enc.id });
  campaign = commit(campaign, start.events);
  const begin = engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.id });
  campaign = commit(campaign, begin.events);
  return { engine, campaign, encounterId: enc.id };
};

describe('slice 648: Deflect Attacks', () => {
  it('computes reduction = 1d10 + DEX mod + monk level for a Slashing hit', () => {
    const monk = buildMonk(3, 16); // DEX 16 → +3
    const attacker = buildAttacker();
    const s = startEncounter(monk, attacker);
    const triggerId = newEventId();
    const out = s.engine.plan.deflectAttacks(s.campaign.state, {
      monkId: monk.id,
      triggeringAttackEventId: triggerId,
      incomingDamage: 8,
      damageType: 'slashing',
    });
    // Reduction = 1d10 + 3 (DEX) + 3 (monk level) = [7, 16].
    expect(out.reduction).toBeGreaterThanOrEqual(7);
    expect(out.reduction).toBeLessThanOrEqual(16);
    // remainingDamage = max(0, 8 - reduction). 8 < 7 so remainingDamage = 0.
    expect(out.remainingDamage).toBe(0);
  });

  it('clamps remainingDamage at 0 when reduction exceeds incomingDamage; preserves positive remainder otherwise', () => {
    // Sweep seeds; for high incomingDamage (50), remainingDamage > 0
    // since max reduction is 10+3+3 = 16.
    const monk = buildMonk(3, 16);
    const attacker = buildAttacker();
    for (let seed = 1; seed < 5; seed += 1) {
      const s = startEncounter(monk, attacker, seed);
      const out = s.engine.plan.deflectAttacks(s.campaign.state, {
        monkId: monk.id,
        triggeringAttackEventId: newEventId(),
        incomingDamage: 50,
        damageType: 'piercing',
      });
      expect(out.remainingDamage).toBeGreaterThanOrEqual(50 - 16);
      expect(out.remainingDamage).toBeLessThanOrEqual(50 - 7);
    }
  });

  it('emits ActionEconomyConsumed (reaction) + DeflectAttacksUsed event in-encounter', () => {
    const monk = buildMonk(3);
    const attacker = buildAttacker();
    const s = startEncounter(monk, attacker);
    const out = s.engine.plan.deflectAttacks(s.campaign.state, {
      monkId: monk.id,
      triggeringAttackEventId: newEventId(),
      incomingDamage: 6,
      damageType: 'bludgeoning',
    });
    const reaction = out.events.find(
      (e): e is ActionEconomyConsumedEvent =>
        e.type === 'ActionEconomyConsumed' && e.kind === 'reaction',
    );
    expect(reaction, 'reaction not consumed').toBeDefined();
    const used = out.events.find(
      (e): e is DeflectAttacksUsedEvent => e.type === 'DeflectAttacksUsed',
    );
    expect(used, 'DeflectAttacksUsed not emitted').toBeDefined();
    expect(used!.reduction).toBe(out.reduction);
    expect(used!.incomingDamage).toBe(6);
    expect(used!.remainingDamage).toBe(out.remainingDamage);
  });

  // Slice 658: counter arm. RAW: "If you reduce the damage to 0,
  // you can expend 1 Focus Point to redirect ... 2x Martial Arts die
  // + DEX mod ... DEX save."

  it('counter arm: fires when remainingDamage === 0 AND counterTargetId supplied AND ki available', () => {
    // L3 Monk DEX 16 against incomingDamage = 1; reduction is
    // 1d10 + 3 + 3 = [7,16] -> remainingDamage = 0 always. Counter
    // target supplied + 2 ki points available.
    const monk = CharacterSchema.parse({
      ...buildMonk(3, 16),
      resources: [{ resourceId: 'ki', current: 2, max: 2 }],
    });
    const target = buildAttacker();
    const s = startEncounter(monk, target);
    const out = s.engine.plan.deflectAttacks(s.campaign.state, {
      monkId: monk.id,
      triggeringAttackEventId: newEventId(),
      incomingDamage: 1,
      damageType: 'piercing',
      counterTargetId: target.id,
    });
    expect(out.remainingDamage).toBe(0);
    expect(out.counterFired, 'counter should have fired').toBe(true);
    expect(typeof out.counterSaveSuccess).toBe('boolean');
    // ResourceSpent (ki 1) must be emitted.
    expect(
      out.events.some((e) => e.type === 'ResourceSpent' && (e as { resourceId?: string }).resourceId === 'ki'),
    ).toBe(true);
    // SaveRolled must be emitted.
    expect(out.events.some((e) => e.type === 'SaveRolled')).toBe(true);
  });

  it('counter arm: does NOT fire when remainingDamage > 0', () => {
    // incomingDamage = 100 -> reduction can never zero it.
    const monk = CharacterSchema.parse({
      ...buildMonk(3, 16),
      resources: [{ resourceId: 'ki', current: 2, max: 2 }],
    });
    const target = buildAttacker();
    const s = startEncounter(monk, target);
    const out = s.engine.plan.deflectAttacks(s.campaign.state, {
      monkId: monk.id,
      triggeringAttackEventId: newEventId(),
      incomingDamage: 100,
      damageType: 'piercing',
      counterTargetId: target.id,
    });
    expect(out.remainingDamage).toBeGreaterThan(0);
    expect(out.counterFired).toBe(false);
  });

  it('counter arm: does NOT fire when ki is 0 (even if remainingDamage === 0)', () => {
    const monk = CharacterSchema.parse({
      ...buildMonk(3, 16),
      resources: [{ resourceId: 'ki', current: 0, max: 2 }],
    });
    const target = buildAttacker();
    const s = startEncounter(monk, target);
    const out = s.engine.plan.deflectAttacks(s.campaign.state, {
      monkId: monk.id,
      triggeringAttackEventId: newEventId(),
      incomingDamage: 1,
      damageType: 'piercing',
      counterTargetId: target.id,
    });
    expect(out.remainingDamage).toBe(0);
    expect(out.counterFired).toBe(false);
  });

  it('counter arm: does NOT fire when no counterTargetId supplied (back-compat with slice 648)', () => {
    const monk = CharacterSchema.parse({
      ...buildMonk(3, 16),
      resources: [{ resourceId: 'ki', current: 2, max: 2 }],
    });
    const target = buildAttacker();
    const s = startEncounter(monk, target);
    const out = s.engine.plan.deflectAttacks(s.campaign.state, {
      monkId: monk.id,
      triggeringAttackEventId: newEventId(),
      incomingDamage: 1,
      damageType: 'piercing',
      // No counterTargetId.
    });
    expect(out.remainingDamage).toBe(0);
    expect(out.counterFired).toBe(false);
  });

  it('counter arm: damage type matches the incoming attack', () => {
    // Sweep seeds to find one where the counter target fails the save
    // (so DamageApplied actually fires), then verify the damage type.
    let proven = false;
    for (let seed = 1; seed < 30 && !proven; seed += 1) {
      const monk = CharacterSchema.parse({
        ...buildMonk(3, 16),
        resources: [{ resourceId: 'ki', current: 2, max: 2 }],
      });
      const target = buildAttacker(); // DEX 12 -> mod +1, low save
      const s = startEncounter(monk, target, seed);
      const out = s.engine.plan.deflectAttacks(s.campaign.state, {
        monkId: monk.id,
        triggeringAttackEventId: newEventId(),
        incomingDamage: 1,
        damageType: 'slashing',
        counterTargetId: target.id,
      });
      if (!out.counterFired || out.counterSaveSuccess) continue;
      const damageApplied = out.events.find(
        (e): e is import('../../../src/schemas/events/combat.js').DamageAppliedEvent =>
          e.type === 'DamageApplied' && (e as { source?: string }).source === 'deflect-attacks-counter',
      );
      expect(damageApplied, `seed ${seed}: no counter DamageApplied emitted`).toBeDefined();
      expect(damageApplied!.components.some((c) => c.type === 'slashing')).toBe(true);
      proven = true;
    }
    expect(proven, 'expected at least one seed to produce counter DamageApplied').toBe(true);
  });

  it('rejects: non-monk, monk under L3, non-deflectable damage type, reaction already used', () => {
    const wizard = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Mage',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
      hp: { current: 28, max: 28, temp: 0 },
    });
    const sw = startEncounter(wizard, buildAttacker());
    expect(() =>
      sw.engine.plan.deflectAttacks(sw.campaign.state, {
        monkId: wizard.id,
        triggeringAttackEventId: newEventId(),
        incomingDamage: 5,
        damageType: 'slashing',
      }),
    ).toThrow(/Deflect Attacks/);

    const lowMonk = buildMonk(2);
    const sl = startEncounter(lowMonk, buildAttacker());
    expect(() =>
      sl.engine.plan.deflectAttacks(sl.campaign.state, {
        monkId: lowMonk.id,
        triggeringAttackEventId: newEventId(),
        incomingDamage: 5,
        damageType: 'slashing',
      }),
    ).toThrow(/Deflect Attacks/);

    // Non-deflectable damage type (Fire)
    const monk = buildMonk(3);
    const sf = startEncounter(monk, buildAttacker());
    expect(() =>
      sf.engine.plan.deflectAttacks(sf.campaign.state, {
        monkId: monk.id,
        triggeringAttackEventId: newEventId(),
        incomingDamage: 5,
        damageType: 'fire' as unknown as 'bludgeoning',
      }),
    ).toThrow(/Bludgeoning, Piercing, or Slashing/);

    // Reaction already used this round
    const monk2 = buildMonk(3);
    const s2 = startEncounter(monk2, buildAttacker());
    const first = s2.engine.plan.deflectAttacks(s2.campaign.state, {
      monkId: monk2.id,
      triggeringAttackEventId: newEventId(),
      incomingDamage: 5,
      damageType: 'slashing',
    });
    const campaign2 = commit(s2.campaign, first.events);
    expect(() =>
      s2.engine.plan.deflectAttacks(campaign2.state, {
        monkId: monk2.id,
        triggeringAttackEventId: newEventId(),
        incomingDamage: 5,
        damageType: 'slashing',
      }),
    ).toThrow(/already used their reaction/);
  });
});
