// Slice 549: Sneak Attack RAW weapon gate (Finesse or Ranged).
//
// RAW (SRD 5.2.1 Rogue L1): "Once per turn, you can deal an extra
// 1d6 damage to one creature you hit with an attack roll if you have
// Advantage on the roll and the attack uses a Finesse or Ranged
// weapon."
//
// Pre-slice the engine's sneak-attack OnEvent filter had three terms:
// attackerIsSelf, hit, and the advantage/ally-adjacent disjunction.
// It did NOT enforce the weapon-type clause, so a Rogue could trigger
// Sneak Attack with a Greatsword or Mace as long as they had
// Advantage. This slice adds three new dispatch-time facts
// (event.attackerWeaponHasFinesse / .attackerWeaponIsRanged /
// .attackerWeaponIsFinesseOrRanged) and inserts the third term into
// every Sneak Attack filter (10 levels: L1, L3, L5, L7, L9, L11, L13,
// L15, L17, L19).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';

const PACK = loadStarterPack();

const buildRogue = (weaponInstanceId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 18, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
    equipped: { mainHand: weaponInstanceId },
    inventory: [weaponInstanceId],
  });

const buildDummy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const seedCampaign = (engine: ReturnType<typeof createEngine>, characters: Character[], items: ItemInstance[]) => {
  let campaign = engine.createCampaign({ name: 'sa-gate' });
  campaign = commit(campaign, [
    ...characters.map<CharacterCreatedEvent>((c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c })),
    ...items.map<ItemAcquiredEvent>((item) => ({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: item })),
  ]);
  return campaign;
};

// Find a seed that produces an attack with advantage that HITS, so the
// rider would fire if the weapon gate allowed it. We iterate seeds to
// guarantee deterministic hits; if Sneak Attack damage is absent on a
// hit, the gate worked. If absent on a miss, the test is meaningless.
const findHittingAdvantageAttack = (
  baseEngine: ReturnType<typeof createEngine>,
  campaign: ReturnType<typeof baseEngine.createCampaign>,
  rogueId: string,
  targetId: string,
  weaponId: string,
  startSeed: number,
): { events: ReadonlyArray<unknown> } | undefined => {
  for (let seed = startSeed; seed < startSeed + 80; seed++) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: rogueId,
      targetId,
      weaponInstanceId: weaponId,
      advantage: 'advantage',
    });
    const attack = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
    if (attack?.hit === true) return { events };
  }
  return undefined;
};

describe('Sneak Attack RAW weapon gate (slice 549)', () => {
  it('FINESSE weapon (Rapier): Sneak Attack DOES fire on advantage hit', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const rapier = makeItemInstance('rapier');
    const rogue = buildRogue(rapier.id);
    const dummy = buildDummy();
    const campaign = seedCampaign(engine, [rogue, dummy], [rapier]);
    const result = findHittingAdvantageAttack(engine, campaign, rogue.id, dummy.id, rapier.id, 1);
    expect(result).toBeDefined();
    const triggerFired = (result!.events as Array<{ type: string }>).filter((e) => e.type === 'TriggerFired');
    expect(triggerFired.length).toBe(1); // Sneak Attack rider fired
  });

  it('RANGED weapon (Shortbow): Sneak Attack DOES fire on advantage hit', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const shortbow = makeItemInstance('shortbow');
    const rogue = buildRogue(shortbow.id);
    const dummy = buildDummy();
    const campaign = seedCampaign(engine, [rogue, dummy], [shortbow]);
    const result = findHittingAdvantageAttack(engine, campaign, rogue.id, dummy.id, shortbow.id, 1);
    expect(result).toBeDefined();
    const triggerFired = (result!.events as Array<{ type: string }>).filter((e) => e.type === 'TriggerFired');
    expect(triggerFired.length).toBe(1);
  });

  it('NON-FINESSE MELEE weapon (Mace): Sneak Attack does NOT fire on advantage hit', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const mace = makeItemInstance('mace');
    const rogue = buildRogue(mace.id);
    const dummy = buildDummy();
    const campaign = seedCampaign(engine, [rogue, dummy], [mace]);
    const result = findHittingAdvantageAttack(engine, campaign, rogue.id, dummy.id, mace.id, 1);
    expect(result).toBeDefined();
    const triggerFired = (result!.events as Array<{ type: string }>).filter((e) => e.type === 'TriggerFired');
    expect(triggerFired.length).toBe(0); // gate blocks the Sneak Attack rider
  });

  it('NON-FINESSE MELEE weapon (Greatsword): Sneak Attack does NOT fire on advantage hit', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const greatsword = makeItemInstance('greatsword');
    const rogue = buildRogue(greatsword.id);
    const dummy = buildDummy();
    const campaign = seedCampaign(engine, [rogue, dummy], [greatsword]);
    const result = findHittingAdvantageAttack(engine, campaign, rogue.id, dummy.id, greatsword.id, 1);
    expect(result).toBeDefined();
    const triggerFired = (result!.events as Array<{ type: string }>).filter((e) => e.type === 'TriggerFired');
    expect(triggerFired.length).toBe(0);
  });

  it('LIGHT FINESSE weapon (Shortsword): Sneak Attack DOES fire on advantage hit', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const shortsword = makeItemInstance('shortsword');
    const rogue = buildRogue(shortsword.id);
    const dummy = buildDummy();
    const campaign = seedCampaign(engine, [rogue, dummy], [shortsword]);
    const result = findHittingAdvantageAttack(engine, campaign, rogue.id, dummy.id, shortsword.id, 1);
    expect(result).toBeDefined();
    const triggerFired = (result!.events as Array<{ type: string }>).filter((e) => e.type === 'TriggerFired');
    expect(triggerFired.length).toBe(1);
  });
});
