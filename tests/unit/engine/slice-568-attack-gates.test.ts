// Slice 568: three engine gates the audit surfaced as missing.
//
// 1. Paralyzed / Unconscious "within 5 ft" auto-crit
//    RAW Paralyzed: "Any attack that hits the creature is a critical
//    hit if the attacker is within 5 feet of the creature."
//    RAW Unconscious: same line.
//    The engine doesn't track positional adjacency, so melee attacks
//    are the proxy for "within 5 feet" (the common case: 5 ft melee
//    reach). Triggers on paralyzed / held-paralyzed-active /
//    unconscious / HP <= 0.
//
// 2. Prone asymmetric attacker advantage
//    RAW Prone: bearer's attacks at Disadvantage (pre-existing);
//    melee attacks against bearer get Advantage; ranged attacks
//    against bearer get Disadvantage. The asymmetric arms gate on
//    the new `event.attackKind` fact added to both attacker-side
//    facts maps in slice 568.
//
// 3. Grappled disadvantage on attacks vs non-grappler
//    RAW Grappled: bearer's attack rolls have Disadvantage on targets
//    other than the grappler. Gates on the new
//    `bearer.targetIsNotGrappler` fact populated by attack.ts —
//    derived from the bearer's grappled condition's sourceCharacterId.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, mainHandId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: [mainHandId],
    equipped: { mainHand: mainHandId, attuned: [] },
  });

const buildVictim = (conditionIds: string[], sourceCharacterId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    appliedConditions: conditionIds.map((cid) => ({
      id: newAppliedConditionId(),
      conditionId: cid,
      appliedAt: isoTimestamp(),
      ...(sourceCharacterId !== undefined ? { sourceCharacterId } : {}),
    })),
  });

const findAttack = (events: ReadonlyArray<unknown>): AttackRolledEvent | undefined =>
  events.find((e): e is AttackRolledEvent =>
    (e as { type: string }).type === 'AttackRolled');

describe('Within-5-ft auto-crit on Paralyzed / Unconscious (slice 568)', () => {
  it('melee hit vs Paralyzed target → critical = true', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const victim = buildVictim(['paralyzed']);
    let campaign = engine.createCampaign({ name: 'paralyzed-crit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 1; seed < 50; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: victim.id,
        weaponInstanceId: longsword.id,
      });
      const atk = findAttack(events);
      if (atk?.hit !== true) continue;
      expect(atk.critical, `seed ${seed}: melee hit vs paralyzed should be crit`).toBe(true);
      return;
    }
    throw new Error('no seed produced a hit');
  });

  it('melee hit vs Unconscious target → critical = true', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const victim = buildVictim(['unconscious']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'unconscious-crit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 1; seed < 50; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: victim.id,
        weaponInstanceId: longsword.id,
      });
      const atk = findAttack(events);
      if (atk?.hit !== true) continue;
      expect(atk.critical).toBe(true);
      return;
    }
    throw new Error('no seed produced a hit');
  });

  it('melee hit vs Hold Person target (held-paralyzed-active) → critical = true', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const victim = buildVictim(['held-paralyzed-active']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'hold-person-crit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 1; seed < 50; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: victim.id,
        weaponInstanceId: longsword.id,
      });
      const atk = findAttack(events);
      if (atk?.hit !== true) continue;
      expect(atk.critical).toBe(true);
      return;
    }
    throw new Error('no seed produced a hit');
  });

  it('RANGED hit vs Paralyzed target → NOT auto-crit (RAW "within 5 ft")', () => {
    const bow = makeItemInstance('longbow');
    const fighter = buildFighter('Aria', bow.id);
    const victim = buildVictim(['paralyzed']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'ranged-no-crit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
    ]);
    // Walk seeds to find a non-natural-20 hit so the only crit source is the auto-crit (which should NOT fire for ranged).
    for (let seed = 1; seed < 80; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: victim.id,
        weaponInstanceId: bow.id,
      });
      const atk = findAttack(events);
      if (atk?.hit !== true) continue;
      const usedRoll = atk.d20[atk.used === 'advantage' ? Math.max(...atk.d20) : 0];
      if (usedRoll === 20) continue; // nat-20 is a crit on its own
      expect(atk.critical).toBe(false);
      return;
    }
    throw new Error('no seed produced a non-natural-20 hit');
  });

  it('melee hit vs target with HP <= 0 (synthetic-unconscious) → critical = true', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const downed = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Downed',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 0, max: 30, temp: 0 },
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'downed-crit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: downed } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 1; seed < 50; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: downed.id,
        weaponInstanceId: longsword.id,
      });
      const atk = findAttack(events);
      if (atk?.hit !== true) continue;
      expect(atk.critical).toBe(true);
      return;
    }
    throw new Error('no seed produced a hit');
  });

  it('melee hit vs Stunned target → NOT auto-crit (RAW exempts Stunned)', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const stunned = buildVictim(['stunned']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'stunned-no-crit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stunned } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 1; seed < 80; seed += 1) {
      const eng = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const { events } = eng.plan.attack(campaign.state, {
        attackerId: fighter.id,
        targetId: stunned.id,
        weaponInstanceId: longsword.id,
      });
      const atk = findAttack(events);
      if (atk?.hit !== true) continue;
      const maxRoll = Math.max(...atk.d20);
      if (maxRoll >= 20) continue; // nat-20 crits regardless
      expect(atk.critical).toBe(false);
      return;
    }
    throw new Error('no seed produced a non-nat-20 hit');
  });
});

describe('Prone asymmetric attacker advantage (slice 568)', () => {
  it('melee attack vs Prone target rolls with Advantage', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Aria', longsword.id);
    const prone = buildVictim(['prone']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'prone-melee' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: prone } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: fighter.id,
      targetId: prone.id,
      weaponInstanceId: longsword.id,
    });
    const atk = findAttack(events);
    expect(atk!.used).toBe('advantage');
  });

  it('ranged attack vs Prone target rolls with Disadvantage', () => {
    const bow = makeItemInstance('longbow');
    const fighter = buildFighter('Aria', bow.id);
    const prone = buildVictim(['prone']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'prone-ranged' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: prone } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: fighter.id,
      targetId: prone.id,
      weaponInstanceId: bow.id,
    });
    const atk = findAttack(events);
    expect(atk!.used).toBe('disadvantage');
  });
});

describe('Grappled disadvantage on attacks vs non-grappler (slice 568)', () => {
  it("Grappled bearer attacking the grappler → no disadvantage (target IS grappler)", () => {
    const longsword = makeItemInstance('longsword');
    const grappler = buildFighter('Grappler', longsword.id);
    const bearer = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Bearer',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
      appliedConditions: [{
        id: newAppliedConditionId(),
        conditionId: 'grappled',
        appliedAt: isoTimestamp(),
        sourceCharacterId: grappler.id,
      }],
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'grappled-vs-grappler' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: grappler } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bearer } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: bearer.id,
      targetId: grappler.id,
      weaponInstanceId: longsword.id,
    });
    const atk = findAttack(events);
    expect(atk!.used).toBe('none');
  });

  it('Grappled bearer attacking a non-grappler → disadvantage', () => {
    const longsword = makeItemInstance('longsword');
    const grappler = buildFighter('Grappler', longsword.id);
    const otherTargetWeapon = makeItemInstance('longsword');
    const otherTarget = buildFighter('Bystander', otherTargetWeapon.id);
    const bearer = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Bearer',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 12, max: 12, temp: 0 },
      appliedConditions: [{
        id: newAppliedConditionId(),
        conditionId: 'grappled',
        appliedAt: isoTimestamp(),
        sourceCharacterId: grappler.id,
      }],
    });
    const bearerWeapon = makeItemInstance('longsword');
    const bearerEquipped = CharacterSchema.parse({
      ...bearer,
      inventory: [bearerWeapon.id],
      equipped: { mainHand: bearerWeapon.id, attuned: [] },
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'grappled-vs-other' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: otherTargetWeapon } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bearerWeapon } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: grappler } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: otherTarget } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bearerEquipped } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: bearerEquipped.id,
      targetId: otherTarget.id,
      weaponInstanceId: bearerWeapon.id,
    });
    const atk = findAttack(events);
    expect(atk!.used).toBe('disadvantage');
  });

  it('non-Grappled attacker → no disadvantage (control)', () => {
    const longsword = makeItemInstance('longsword');
    const fighter = buildFighter('Free', longsword.id);
    const targetWeapon = makeItemInstance('longsword');
    const target = buildFighter('Target', targetWeapon.id);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    let campaign = engine.createCampaign({ name: 'free-control' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: targetWeapon } satisfies ItemAcquiredEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: fighter.id,
      targetId: target.id,
      weaponInstanceId: longsword.id,
    });
    const atk = findAttack(events);
    expect(atk!.used).toBe('none');
  });
});
