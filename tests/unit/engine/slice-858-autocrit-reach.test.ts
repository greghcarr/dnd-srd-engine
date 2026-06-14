// Slice 858 — `auto-crit-reach-overgrant`.
//
// RAW (Paralyzed / Unconscious): "Any attack that hits the creature is a
// critical hit if the attacker is within 5 feet of the creature." Slice 568
// used `attackKind === 'melee'` as the within-5 proxy, so a 10-ft REACH weapon
// (glaive, halberd, pike, whip) auto-crit even when RAW forbids it.
//
// The fix resolves within-5 PRECISELY from positions when both combatants are
// positioned in an active encounter; when the engine is position-less it falls
// back to a weapon-reach proxy — a non-reach melee weapon is always within 5
// ft, but a reach weapon might be at 6-10 ft, so it does NOT auto-crit.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildFighter = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aria',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    inventory: [weaponId],
    equipped: { mainHand: weaponId, attuned: [] },
  });

const buildParalyzedVictim = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'paralyzed', appliedAt: isoTimestamp() }],
  });

const findAttack = (events: ReadonlyArray<unknown>): AttackRolledEvent | undefined =>
  events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');

// Position-less attack with `weaponDef` vs a paralyzed victim, at a fixed seed.
const positionlessAttack = (weaponDef: string, seed: number): AttackRolledEvent | undefined => {
  const weapon = makeItemInstance(weaponDef);
  const fighter = buildFighter(weapon.id);
  const victim = buildParalyzedVictim();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'autocrit' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
  ]);
  return findAttack(engine.plan.attack(campaign.state, {
    attackerId: fighter.id,
    targetId: victim.id,
    weaponInstanceId: weapon.id,
  }).events);
};

// Positioned (in-encounter) glaive attack vs a paralyzed victim placed at
// `targetFeet` from the attacker (at the origin), at a fixed seed.
const positionedGlaiveAttack = (targetFeet: number, seed: number): AttackRolledEvent | undefined => {
  const weapon = makeItemInstance('glaive');
  const fighter = buildFighter(weapon.id);
  const victim = buildParalyzedVictim();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'autocrit-pos' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [fighter.id, victim.id] });
  campaign = commit(campaign, enc.events);
  const place = (combatantId: string, x: number) => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved' as const, encounterId: enc.encounterId,
    combatantId, fromPosition: { x: 0, y: 0 }, toPosition: { x, y: 0 }, feetTraveled: 0,
  });
  campaign = commit(campaign, [place(fighter.id, 0), place(victim.id, targetFeet)]);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return findAttack(engine.plan.attack(campaign.state, {
    attackerId: fighter.id,
    targetId: victim.id,
    weaponInstanceId: weapon.id,
  }).events);
};

describe('slice 858: auto-crit vs Paralyzed honors within-5-ft (no reach over-grant)', () => {
  it('position-less: a non-reach melee hit auto-crits, a reach (glaive) hit does NOT', () => {
    // Seed 1: both roll d20 [10,10] (paralyzed → attacker advantage), used 10 —
    // a hit but NOT a natural crit, so any crit is the auto-crit.
    const longsword = positionlessAttack('longsword', 1);
    const glaive = positionlessAttack('glaive', 1);
    expect(longsword?.hit).toBe(true);
    expect(glaive?.hit).toBe(true);
    expect(longsword!.critical).toBe(true); // non-reach → within 5 ft → auto-crit
    expect(glaive!.critical).toBe(false); // reach → maybe at 10 ft → no auto-crit (the fix)
  });

  it('positioned: a reach (glaive) hit auto-crits at 5 ft but NOT at 10 ft', () => {
    // Find a seed where the in-encounter glaive HITS with a non-natural-crit
    // used roll (so `critical` reflects only the within-5 auto-crit).
    let seed = -1;
    for (let s = 1; s < 120; s += 1) {
      const a = positionedGlaiveAttack(10, s);
      if (a?.hit === true && Math.max(...a.d20) < 20) { seed = s; break; }
    }
    expect(seed, 'a non-natural-crit hitting seed exists').toBeGreaterThan(0);
    // Same seed (position differs by a no-RNG CombatantMoved), so the d20 matches.
    expect(positionedGlaiveAttack(5, seed)!.critical).toBe(true); // within 5 ft → auto-crit
    expect(positionedGlaiveAttack(10, seed)!.critical).toBe(false); // 10 ft → no auto-crit
  });
});
