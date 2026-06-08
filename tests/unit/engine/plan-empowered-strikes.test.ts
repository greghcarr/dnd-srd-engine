import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

// Slice 735: Monk L6 Empowered Strikes (SRD 5.2.1). RAW: "Whenever you
// deal damage with your Unarmed Strike, it can deal your choice of Force
// damage or its normal damage type." Wired via the `GrantUnarmedForceOption`
// marker; the attack / flurry / off-hand planners override the unarmed
// strike's damage type to Force when the attacker opts in
// (`unarmedStrikeAsForce`). Replaces the 2014 "magical unarmed" wiring
// (`GrantUnarmedAsMagical`), which stays an available primitive.

const PACK = loadStarterPack();

const unarmedStrike = (): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'unarmed-strike' });

const buildMonk = (level: number, strikeId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Kai',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 18, CON: 14, INT: 10, WIS: 16, CHA: 8 },
    hp: { current: 50, max: 50, temp: 0 },
    resources: [{ resourceId: 'ki', current: level, max: level }],
    inventory: [strikeId],
    equipped: { mainHand: strikeId, attuned: [] },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 8, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 80, max: 80, temp: 0 },
  });

const seedScene = (monkLevel: number) => {
  const strike = unarmedStrike();
  const monk = buildMonk(monkLevel, strike.id);
  const target = buildTarget();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(207) });
  let campaign: Campaign = engine.createCampaign({ name: `empowered-${monkLevel}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: strike },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, monkId: monk.id, targetId: target.id, strikeId: strike.id };
};

// Drive seeds until an unarmed strike lands, returning the DamageApplied.
const firstHit = (
  scene: ReturnType<typeof seedScene>,
  asForce: boolean,
): DamageAppliedEvent => {
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const events = engine.plan.attack(scene.campaign.state, {
      attackerId: scene.monkId,
      targetId: scene.targetId,
      weaponInstanceId: scene.strikeId,
      ...(asForce ? { unarmedStrikeAsForce: true } : {}),
    }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit !== true) continue;
    const damage = events.find(
      (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === scene.targetId,
    );
    if (damage !== undefined) return damage;
  }
  throw new Error('no hit landed in 80 seeds');
};

describe('Empowered Strikes (Monk L6, SRD 5.2.1 Force option)', () => {
  it('a L6 monk who opts in deals Force damage with an unarmed strike', () => {
    const damage = firstHit(seedScene(6), true);
    expect(damage.components[0]!.type).toBe('force');
  });

  it('without opting in, the same L6 monk deals the normal type (control)', () => {
    const damage = firstHit(seedScene(6), false);
    expect(damage.components[0]!.type).toBe('bludgeoning');
  });

  it('a L5 monk opting in still deals the normal type (no feature yet)', () => {
    const damage = firstHit(seedScene(5), true);
    expect(damage.components[0]!.type).toBe('bludgeoning');
  });

  it('the Force option carries through Flurry of Blows', () => {
    const scene = seedScene(6);
    let forceSeen = false;
    for (let seed = 1; seed < 40 && !forceSeen; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const events = engine.plan.flurryOfBlows(scene.campaign.state, {
        monkId: scene.monkId,
        targetId: scene.targetId,
        weaponInstanceId: scene.strikeId,
        unarmedStrikeAsForce: true,
      }).events;
      const damages = events.filter(
        (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === scene.targetId,
      );
      if (damages.length > 0) {
        for (const d of damages) expect(d.components[0]!.type).toBe('force');
        forceSeen = true;
      }
    }
    expect(forceSeen, 'no Flurry strike landed in 40 seeds').toBe(true);
  });
});
