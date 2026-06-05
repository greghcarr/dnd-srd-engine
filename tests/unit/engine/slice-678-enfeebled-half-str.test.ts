// Slice 678: enfeebled half-STR-weapon-damage enforcement.
//
// New `HalvesStrengthWeaponDamage` marker effect. Enfeebled projects
// it; planAttack reads the bearer's effect stack via
// EffectAccumulator.hasHalvesStrengthWeaponDamage() and, when set
// AND damageAbility === 'STR', halves the base weapon damage roll
// (floor). Riders pass through unhalved per the RAW reading.

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
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { ItemEquippedEvent } from '../../../src/schemas/events/inventory.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const seedAndAttack = (
  weapon: 'greatsword' | 'rapier',
  enfeebled: boolean,
  s: number,
): { hit: boolean; damageAmount: number; damageType: string } | null => {
  const attackerId = newCharacterId();
  const targetId = newCharacterId();
  const weaponInstanceId = newItemInstanceId();
  const attacker = CharacterSchema.parse({
    id: attackerId,
    name: 'Attacker',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 20, DEX: 20, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    appliedConditions: enfeebled
      ? [{ id: newAppliedConditionId(), conditionId: 'enfeebled' }]
      : [],
  });
  const target = CharacterSchema.parse({
    id: targetId,
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
  });
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(s) });
  let campaign: Campaign = engine.createCampaign({ name: `enfeebled-${s}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ItemAcquired',
      characterId: attackerId,
      instance: {
        id: weaponInstanceId as ULID,
        definitionId: weapon,
        quantity: 1,
      },
    } satisfies ItemAcquiredEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ItemEquipped',
      characterId: attackerId,
      instanceId: weaponInstanceId as ULID,
      slot: 'mainHand',
    } satisfies ItemEquippedEvent,
  ]);
  const out = engine.plan.attack(campaign.state, {
    attackerId,
    targetId,
    weaponInstanceId,
  });
  const att = out.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  const dmg = out.events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
  if (att?.hit !== true || dmg === undefined) return null;
  return { hit: true, damageAmount: dmg.components[0]!.amount, damageType: dmg.components[0]!.type };
};

describe('slice 678: enfeebled HalvesStrengthWeaponDamage', () => {
  it('enfeebled condition projects HalvesStrengthWeaponDamage effect', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'enfeebled');
    expect(condition?.effects.some((e) => e.kind === 'HalvesStrengthWeaponDamage')).toBe(true);
  });

  it('STR-weapon attack (greatsword): enfeebled attacker deals less damage than non-enfeebled (same seed)', () => {
    for (let s = 1; s <= 50; s += 1) {
      const a = seedAndAttack('greatsword', false, s);
      const b = seedAndAttack('greatsword', true, s);
      if (a === null || b === null) continue;
      expect(b.damageAmount).toBeLessThan(a.damageAmount);
      return;
    }
    throw new Error('Could not find seed where both attacks hit');
  });

  it('DEX-weapon attack (rapier, finesse): enfeebled attacker is UNAFFECTED (damageAbility=DEX)', () => {
    // Rapier is finesse; chooseDamageAbility picks max(STR, DEX) mod.
    // With STR=20, DEX=20 (both +5), the tiebreaker prefers DEX per
    // the chooseDamageAbility logic; the slice-678 halving requires
    // damageAbility === 'STR' so DEX-routed attacks are unaffected.
    for (let s = 1; s <= 50; s += 1) {
      const a = seedAndAttack('rapier', false, s);
      const b = seedAndAttack('rapier', true, s);
      if (a === null || b === null) continue;
      expect(b.damageAmount).toBe(a.damageAmount);
      return;
    }
    throw new Error('No matching seed where both rapier attacks hit');
  });
});
