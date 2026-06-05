// Slice 666: on-hit rider via castSpell.
//
// Closes two deferred L2 spells:
//   - Ray of Enfeeblement (warlock/wizard): ranged spell attack;
//     on hit, target gains 'enfeebled' (half-damage with STR
//     weapon attacks, consumer-managed). Save-ends on the target's
//     end-of-turn CON save. Auto-clears on concentration drop.
//   - Shining Smite (paladin): bonus-action self-buff; first
//     melee weapon hit during the spell deals +2d6 radiant AND
//     applies 'shining-smite-target-illuminated' to the target
//     (advantage to attackers). The rider consumes after the
//     first hit.
//
// Schema change (slice 666): `damageDice` is now optional on the
// `attack` mechanic. When omitted, the planner skips the damage
// roll/apply path entirely — the attack roll + on-hit condition
// is the complete planner outcome. Authored as a sibling of the
// `conditionOnFail` field on the `save` mechanic.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 5, hitDiceRemaining: 5, subclassId: 'fiend-patron' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 18 },
    hp: { current: 28, max: 28, temp: 0 },
  });

const buildPaladin = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sera',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 5, hitDiceRemaining: 5, subclassId: 'oath-of-devotion' }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 18 },
    hp: { current: 40, max: 40, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

const seedTwo = (
  caster: Character,
  target: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'on-hit-rider' });
  campaign = commit(campaign, [
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
  ]);
  return { engine, campaign };
};

describe('slice 666: on-hit rider via castSpell (ray-of-enfeeblement)', () => {
  it('Ray of Enfeeblement: on hit, target gains the enfeebled condition (no damage emitted)', () => {
    const warlock = buildWarlock();
    const target = buildTarget();
    const s = seedTwo(warlock, target);
    let cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: warlock.id,
      spellId: 'ray-of-enfeeblement',
      slotLevel: 3,
      targetIds: [target.id],
      ignorePreparation: true,
    });
    // The seed produces a deterministic attack outcome; iterate seeds
    // if needed to find a hit. Seed 1 hits here.
    let attackEvent = cast.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    let seed = 1;
    while (attackEvent === undefined || attackEvent.hit === false) {
      seed += 1;
      if (seed > 50) throw new Error('Could not find a seed where Ray of Enfeeblement hits');
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp = eng.createCampaign({ name: `re-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      cast = eng.plan.castSpell(camp.state, {
        characterId: warlock.id,
        spellId: 'ray-of-enfeeblement',
        slotLevel: 3,
        targetIds: [target.id],
        ignorePreparation: true,
      });
      attackEvent = cast.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    }
    expect(attackEvent!.hit).toBe(true);
    // ConditionApplied for enfeebled on the target.
    const applied = cast.events.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied' &&
        e.conditionId === 'enfeebled' &&
        e.targetId === target.id,
    );
    expect(applied, 'Enfeebled condition not applied on hit').toBeDefined();
    // No damage events for ray-of-enfeeblement (no damageDice).
    expect(cast.events.some((e) => e.type === 'DamageRolled')).toBe(false);
    expect(cast.events.some((e) => e.type === 'DamageApplied')).toBe(false);
    // The condition is bound to the concentration EffectInstance (set
    // via sourceEffectInstanceId so concentration drop sweeps it).
    expect(applied!.sourceEffectInstanceId).toBeDefined();
  });

  it('Ray of Enfeeblement: on miss, no condition is applied', () => {
    const warlock = buildWarlock();
    const target = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'High-AC Target',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 20, hitDiceRemaining: 20 }],
      // ridiculous DEX to push AC out of range
      abilityScores: { STR: 10, DEX: 30, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 200, max: 200, temp: 0 },
    });
    // Iterate seeds until we find a miss (or give up). With AC ~25
    // the warlock's L5 ranged spell attack will frequently miss.
    let seed = 1;
    let cast: ReturnType<ReturnType<typeof createEngine>['plan']['castSpell']> | undefined;
    let attackEvent: AttackRolledEvent | undefined;
    while (attackEvent === undefined || attackEvent.hit !== false) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp = eng.createCampaign({ name: `roe-miss-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      cast = eng.plan.castSpell(camp.state, {
        characterId: warlock.id,
        spellId: 'ray-of-enfeeblement',
        slotLevel: 3,
        targetIds: [target.id],
        ignorePreparation: true,
      });
      attackEvent = cast.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      seed += 1;
      if (seed > 100) throw new Error('No miss seed found for Ray of Enfeeblement (target AC too low)');
    }
    expect(attackEvent!.hit).toBe(false);
    // No ConditionApplied on miss.
    const applied = cast!.events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'enfeebled',
    );
    expect(applied).toBeUndefined();
  });

  it('Ray of Enfeeblement: concentration drop sweeps the enfeebled condition off the target', () => {
    const warlock = buildWarlock();
    const target = buildTarget();
    // Use the seed-hit path.
    let seed = 1;
    let castOut: ReturnType<ReturnType<typeof createEngine>['plan']['castSpell']> | undefined;
    let attack: AttackRolledEvent | undefined;
    let s: ReturnType<typeof seedTwo> | undefined;
    while (attack === undefined || attack.hit === false) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      let camp = eng.createCampaign({ name: `roe-sweep-${seed}` });
      camp = commit(camp, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      s = { engine: eng, campaign: camp };
      castOut = eng.plan.castSpell(camp.state, {
        characterId: warlock.id,
        spellId: 'ray-of-enfeeblement',
        slotLevel: 3,
        targetIds: [target.id],
        ignorePreparation: true,
      });
      attack = castOut.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      seed += 1;
      if (seed > 50) throw new Error('No hit seed for Ray of Enfeeblement');
    }
    let campaign = commit(s!.campaign, castOut!.events);
    expect(campaign.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'enfeebled')).toBe(true);

    // Find the concentration EffectInstance and drop it manually.
    const conc = campaign.state.characters[warlock.id]!.concentrationEffectId!;
    expect(conc).toBeDefined();
    const broken: ConcentrationBrokenEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConcentrationBroken',
      effectInstanceId: conc,
      casterId: warlock.id,
      reason: 'voluntary',
    };
    campaign = commit(campaign, [broken]);
    expect(campaign.state.characters[target.id]!.appliedConditions.some((c) => c.conditionId === 'enfeebled')).toBe(false);
  });
});

describe('slice 666: Shining Smite (paladin buff with on-hit rider via OnEvent)', () => {
  it('Shining Smite: applies shining-smite-active marker on the paladin via the buff mechanic', () => {
    const pal = buildPaladin();
    const dummy = buildTarget();
    const s = seedTwo(pal, dummy);
    const cast = s.engine.plan.castSpell(s.campaign.state, {
      characterId: pal.id,
      spellId: 'shining-smite',
      slotLevel: 2,
      targetIds: [pal.id],
      ignorePreparation: true,
    });
    const campaign = commit(s.campaign, cast.events);
    expect(
      campaign.state.characters[pal.id]!.appliedConditions.some((c) => c.conditionId === 'shining-smite-active'),
    ).toBe(true);
  });

  it('Shining Smite condition definition: two OnEvent riders (radiant damage + illuminated target), each consumeOnTrigger', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'shining-smite-active');
    expect(condition, 'shining-smite-active not authored in pack').toBeDefined();
    const onEvents = condition!.effects.filter((e) => e.kind === 'OnEvent');
    expect(onEvents.length).toBe(2);
    for (const e of onEvents) {
      expect((e as { consumeOnTrigger?: boolean }).consumeOnTrigger).toBe(true);
    }
  });

  it('shining-smite-target-illuminated: grants advantage to attackers', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'shining-smite-target-illuminated');
    expect(condition).toBeDefined();
    expect(condition!.effects.some((e) => e.kind === 'GrantAdvantageToAttackers')).toBe(true);
  });
});
