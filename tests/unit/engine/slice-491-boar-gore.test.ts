// Slice 491: Boar Gore movement-conditional rider.
//
// RAW (SRD 5.2.1 Boar, CR 1/4): "Gore. Melee Attack Roll: +3, reach 5
// ft. Hit: 4 (1d6 + 1) Piercing damage. If the target is a Medium or
// smaller creature and the boar moved 20+ feet straight toward it
// immediately before the hit, the target takes an extra 3 (1d6)
// Piercing damage and has the Prone condition."
//
// Engine addition:
//   - `chargedAtTarget?: boolean` consumer-coordinated fact on
//     AttackIntent + ResolveAttackInput (slice 491). Same opt-in shape
//     as `bearer.lightLevel` / `attackerHasAllyAdjacentToTarget`: the
//     engine doesn't track movement direction or "movement immediately
//     before the hit," so the consumer signals the combined predicate
//     as one boolean. Surfaces as `event.attackerChargedThisTarget` in
//     the onHit rider's condition facts.
//
// Content addition:
//   - `boar-gore` natural weapon (1d6 piercing) with a single onHit
//     rider carrying both extra 1d6 piercing AND Prone, gated on a
//     compound `all` predicate of (a) target.creatureSize in
//     {Tiny, Small, Medium} AND (b) event.attackerChargedThisTarget.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  DamageRolledEvent,
} from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildBoar = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Boar',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'boar',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 13, DEX: 11, CON: 14, INT: 2, WIS: 9, CHA: 5 },
    hp: { current: 13, max: 13, temp: 0 },
  });

const buildHero = (statblockId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: statblockId ?? 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    ...(statblockId !== undefined ? { statblockId, kind: 'creature' as const } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const runAttack = (params: {
  chargedAtTarget?: boolean;
  targetStatblockId?: 'hippogriff';
}): { hit: boolean; events: ReadonlyArray<{ type: string }> } => {
  // Try a few seeds to find a hit.
  for (let seed = 1; seed < 30; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const gore = makeItemInstance('boar-gore');
    const boar = buildBoar();
    const target = buildHero(params.targetStatblockId);
    let campaign: Campaign = engine.createCampaign({ name: `boar-gore-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: gore },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: boar } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: boar.id,
      targetId: target.id,
      weaponInstanceId: gore.id,
      ...(params.chargedAtTarget === true ? { chargedAtTarget: true } : {}),
    }).events;
    const attack = events.find((e) => e.type === 'AttackRolled') as { hit?: boolean } | undefined;
    if (attack?.hit !== true) continue;
    return { hit: true, events: events as ReadonlyArray<{ type: string }> };
  }
  return { hit: false, events: [] };
};

describe('Boar Gore (slice 491)', () => {
  it('boar-gore weapon ships with the compound size+charge onHit rider', () => {
    const w = PACK.items.find((i) => i.id === 'boar-gore');
    expect(w).toBeDefined();
    if (!w || w.itemKind !== 'weapon') throw new Error('boar-gore missing');
    expect(w.damageDice).toBe('1d6');
    expect(w.damageType).toBe('piercing');
    expect(w.onHit).toHaveLength(1);
    const rider = w.onHit![0]!;
    expect(rider.dice).toBe('1d6');
    expect(rider.damageType).toBe('piercing');
    expect(rider.applyConditionId).toBe('prone');
    expect(rider.condition).toBeDefined();
  });

  it('a non-charged Gore hit on a Medium target: just 1d6 piercing, no extra rider, no Prone', () => {
    const result = runAttack({ chargedAtTarget: false });
    expect(result.hit).toBe(true);
    const dmg = result.events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
    expect(dmg).toBeDefined();
    // Only the primary 1d6 piercing component fires (no extra-damage rider).
    expect(dmg!.rolls.length).toBe(1);
    expect(dmg!.rolls[0]!.type).toBe('piercing');
    const prone = result.events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'prone',
    );
    expect(prone).toBeUndefined();
  });

  it('a charged Gore hit on a Medium target: 1d6 piercing primary + extra 1d6 piercing + Prone', () => {
    const result = runAttack({ chargedAtTarget: true });
    expect(result.hit).toBe(true);
    const dmg = result.events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
    expect(dmg).toBeDefined();
    // Primary 1d6 + extra 1d6 = 2 damage components (or pooled into 2 dice
    // of the same type; the engine emits them as separate roll groups).
    expect(dmg!.rolls.length).toBeGreaterThanOrEqual(2);
    const prone = result.events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'prone',
    ) as ConditionAppliedEvent | undefined;
    expect(prone).toBeDefined();
  });

  it('a charged Gore hit on a Large target: rider does not fire (size gate)', () => {
    const result = runAttack({ chargedAtTarget: true, targetStatblockId: 'hippogriff' }); // Large
    expect(result.hit).toBe(true);
    const prone = result.events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'prone',
    );
    expect(prone).toBeUndefined();
    const dmg = result.events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
    expect(dmg).toBeDefined();
    expect(dmg!.rolls.length).toBe(1); // primary only
  });
});
