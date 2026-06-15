// Slice 875 — Enlarge/Reduce weapon-damage rider via the new WeaponDamageDelta
// effect. Closes the L7 audit Area-2 row `enlarge-reduce-no-damage-rider`.
//
// RAW (SRD 5.2.1 Enlarge/Reduce): Enlarge — "The target's attacks with its
// enlarged weapons or Unarmed Strikes deal an extra 1d4 damage on a hit."
// Reduce — "deal 1d4 less damage on a hit (this can't reduce the damage below
// 1)." Wired as a new `WeaponDamageDelta { dice, mode }` effect read by the
// attack planner: it adds (`enlarged-active`) or subtracts (`reduced-active`)
// a die from the bearer's OWN weapon/Unarmed-Strike damage, of the weapon's
// type, flooring the weapon component at 1 on a subtract. (Mirrors the
// `HalvesStrengthWeaponDamage` precedent; the delta dice aren't crit-doubled.)
//
// Because the delta die is rolled AFTER the weapon dice (and only for a sized
// attacker), the same seed gives `sized = baseline ± delta` and every
// normal-size attack is byte-identical (no extra RNG draw).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId, newItemInstanceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ItemAcquiredEvent, ItemEquippedEvent } from '../../../src/schemas/events/inventory.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

type Size = 'normal' | 'enlarged' | 'reduced';

const seedAndAttack = (
  weapon: string,
  size: Size,
  str: number,
  s: number,
): { damageAmount: number; damageType: string } | null => {
  const attackerId = newCharacterId();
  const targetId = newCharacterId();
  const weaponInstanceId = newItemInstanceId();
  const conditionId = size === 'enlarged' ? 'enlarged-active' : size === 'reduced' ? 'reduced-active' : undefined;
  const attacker: Character = CharacterSchema.parse({
    id: attackerId,
    name: 'Attacker',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: str, DEX: 8, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    appliedConditions: conditionId !== undefined
      ? [{ id: newAppliedConditionId(), conditionId }]
      : [],
  });
  const target: Character = CharacterSchema.parse({
    id: targetId,
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(s) });
  let campaign: Campaign = engine.createCampaign({ name: `er-${size}-${s}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', characterId: attackerId,
      instance: { id: weaponInstanceId as ULID, definitionId: weapon, quantity: 1, attuned: false, identifiedByCharacterIds: [] },
    } satisfies ItemAcquiredEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'ItemEquipped', characterId: attackerId,
      instanceId: weaponInstanceId as ULID, slot: 'mainHand',
    } satisfies ItemEquippedEvent,
  ]);
  const out = engine.plan.attack(campaign.state, { attackerId, targetId, weaponInstanceId });
  const att = out.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  const dmg = out.events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
  if (att?.hit !== true || dmg === undefined) return null;
  return { damageAmount: dmg.components[0]!.amount, damageType: dmg.components[0]!.type };
};

describe('slice 875: Enlarge/Reduce WeaponDamageDelta', () => {
  it('the conditions carry the ±1d4 WeaponDamageDelta riders', () => {
    const enlarged = PACK.conditions!.find((c) => c.id === 'enlarged-active');
    const reduced = PACK.conditions!.find((c) => c.id === 'reduced-active');
    expect(enlarged?.effects).toContainEqual({ kind: 'WeaponDamageDelta', dice: '1d4', mode: 'add' });
    expect(reduced?.effects).toContainEqual({ kind: 'WeaponDamageDelta', dice: '1d4', mode: 'subtract' });
  });

  it('an enlarged attacker deals exactly +1d4 (1-4) over a normal-size attacker (same seed)', () => {
    for (let s = 1; s <= 60; s += 1) {
      const base = seedAndAttack('greatsword', 'normal', 18, s);
      const big = seedAndAttack('greatsword', 'enlarged', 18, s);
      if (base === null || big === null) continue;
      const delta = big.damageAmount - base.damageAmount;
      expect(delta).toBeGreaterThanOrEqual(1);
      expect(delta).toBeLessThanOrEqual(4);
      return;
    }
    throw new Error('no seed where both attacks hit');
  });

  it('a reduced attacker deals 1-4 less than a normal-size attacker (same seed)', () => {
    for (let s = 1; s <= 60; s += 1) {
      const base = seedAndAttack('greatsword', 'normal', 18, s);
      const small = seedAndAttack('greatsword', 'reduced', 18, s);
      if (base === null || small === null) continue;
      const delta = base.damageAmount - small.damageAmount;
      expect(delta).toBeGreaterThanOrEqual(1);
      expect(delta).toBeLessThanOrEqual(4);
      return;
    }
    throw new Error('no seed where both attacks hit');
  });

  it('the reduction can never take the weapon damage below 1 (RAW floor)', () => {
    // A reduced STR-10 (+0) dagger wielder: base 1d4 (1-4), minus 1d4 — the
    // floor keeps it at >= 1 on every hit.
    let sawHit = false;
    for (let s = 1; s <= 120; s += 1) {
      const r = seedAndAttack('dagger', 'reduced', 10, s);
      if (r === null) continue;
      sawHit = true;
      expect(r.damageAmount, `seed ${s}`).toBeGreaterThanOrEqual(1);
    }
    expect(sawHit, 'saw at least one reduced dagger hit').toBe(true);
  });
});
