// Slice 117 — Dueling Fighting Style gates +2 damage on
// melee-attack + off-hand-not-weapon. Also activates the dormant
// `target: 'damage'` modifier-sum pathway in the attack planner;
// the Frenzy condition's +2 damage (Path of the Berserker) was
// likewise dormant and is now wired with a melee predicate.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
// Dueling is a PHB-2024 fighting style (non-SRD); it lives in the extras
// pack since slice 401, so this test loads both packs.
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const EXTRAS = loadPhbExtrasPack();

const buildFighter = (mainHandId: string, offHandId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Duelist',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: ['fighting-style-dueling'],
    inventory: offHandId !== undefined ? [mainHandId, offHandId] : [mainHandId],
    equipped: {
      mainHand: mainHandId,
      ...(offHandId !== undefined ? { offHand: offHandId } : {}),
      attuned: [],
    },
  });

const buildVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
    featsTaken: [],
  });

interface RolledScene {
  rolled: AttackRolledEvent;
  damage: DamageAppliedEvent;
}

const firstHit = (
  state: Parameters<ReturnType<typeof createEngine>['plan']['attack']>[0],
  engineFactory: () => ReturnType<typeof createEngine>,
  attackerId: string,
  targetId: string,
  weaponId: string,
): RolledScene => {
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = engineFactory();
    const events = engine.plan.attack(state, {
      attackerId,
      targetId,
      weaponInstanceId: weaponId,
    }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit !== true) continue;
    const damage = events.find(
      (e): e is DamageAppliedEvent =>
        e.type === 'DamageApplied' && e.targetId === targetId,
    );
    if (damage === undefined) continue;
    return { rolled, damage };
  }
  throw new Error('no hit landed in 80 seeds');
};

describe('Dueling Fighting Style gates +2 damage on melee + off-hand-not-weapon', () => {
  it('melee attack with empty off-hand: +2 damage applies', () => {
    const sword = makeItemInstance('longsword');
    const fighter = buildFighter(sword.id);
    const victim = buildVictim();
    const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(1) });
    let campaign: Campaign = engine.createCampaign({ name: 'dueling-melee-empty' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const dueling = firstHit(
      campaign.state,
      () => createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(1) }),
      fighter.id,
      victim.id,
      sword.id,
    );

    // Baseline: same fighter without the Fighting Style feat.
    const baselineFighter = CharacterSchema.parse({ ...fighter, featsTaken: [] });
    let baselineCampaign: Campaign = engine.createCampaign({ name: 'dueling-baseline' });
    baselineCampaign = commit(baselineCampaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: baselineFighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const baseline = firstHit(
      baselineCampaign.state,
      () => createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(1) }),
      baselineFighter.id,
      victim.id,
      sword.id,
    );

    const duelTotal = dueling.damage.components.reduce((s, c) => s + c.amount, 0);
    const baseTotal = baseline.damage.components.reduce((s, c) => s + c.amount, 0);
    expect(duelTotal).toBe(baseTotal + 2);
  });

  it('melee attack with off-hand weapon: +2 does NOT apply', () => {
    const sword = makeItemInstance('longsword');
    const dagger = makeItemInstance('dagger');
    const fighter = buildFighter(sword.id, dagger.id);
    const victim = buildVictim();
    const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(2) });
    let campaign: Campaign = engine.createCampaign({ name: 'dueling-melee-twoweapon' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const dueling = firstHit(
      campaign.state,
      () => createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(2) }),
      fighter.id,
      victim.id,
      sword.id,
    );

    const baselineFighter = CharacterSchema.parse({ ...fighter, featsTaken: [] });
    let baselineCampaign: Campaign = engine.createCampaign({ name: 'dueling-baseline-twoweapon' });
    baselineCampaign = commit(baselineCampaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: baselineFighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const baseline = firstHit(
      baselineCampaign.state,
      () => createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(2) }),
      baselineFighter.id,
      victim.id,
      sword.id,
    );

    const duelTotal = dueling.damage.components.reduce((s, c) => s + c.amount, 0);
    const baseTotal = baseline.damage.components.reduce((s, c) => s + c.amount, 0);
    expect(duelTotal).toBe(baseTotal);
  });

  it('ranged attack: +2 does NOT apply even with empty off-hand', () => {
    const longbow = makeItemInstance('longbow');
    const archer = CharacterSchema.parse({
      ...buildFighter(longbow.id),
      abilityScores: { STR: 12, DEX: 18, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    });
    const victim = buildVictim();
    const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(3) });
    let campaign: Campaign = engine.createCampaign({ name: 'dueling-ranged' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longbow },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: archer } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const dueling = firstHit(
      campaign.state,
      () => createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(3) }),
      archer.id,
      victim.id,
      longbow.id,
    );

    const baselineArcher = CharacterSchema.parse({ ...archer, featsTaken: [] });
    let baselineCampaign: Campaign = engine.createCampaign({ name: 'dueling-baseline-ranged' });
    baselineCampaign = commit(baselineCampaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longbow },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: baselineArcher } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    const baseline = firstHit(
      baselineCampaign.state,
      () => createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(3) }),
      baselineArcher.id,
      victim.id,
      longbow.id,
    );

    const duelTotal = dueling.damage.components.reduce((s, c) => s + c.amount, 0);
    const baseTotal = baseline.damage.components.reduce((s, c) => s + c.amount, 0);
    expect(duelTotal).toBe(baseTotal);
  });
});
