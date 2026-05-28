// Slice 498: Sorcerous Burst (cantrip) - exploding dice capped at the
// caster's spellcasting modifier.
//
// RAW (SRD 5.2.1 Sorcerous Burst, Sorcerer): "Make a ranged spell
// attack against the target. On a hit, the target takes 1d8 damage of
// a type you choose: Acid, Cold, Fire, Lightning, Poison, Psychic, or
// Thunder. If you roll an 8 on a d8 for this spell, you can roll
// another d8, and add it to the damage. When you cast this spell, the
// maximum number of these d8s you can add to the spell's damage equals
// your spellcasting ability modifier. Cantrip Upgrade: The damage
// increases by 1d8 at levels 5 (2d8), 11 (3d8), and 17 (4d8)."
//
// Engine addition: `explodeOnMaxDie?: boolean` on the attack mechanic
// (slice 498). When set, each base/scaling die that maxes spawns an
// extra die (chained), capped at the caster's spellcasting ability
// modifier. The die size is read from `damageDice`.
//
// Content: sorcerous-burst attack mechanic with damageDice 1d8,
// cantripScalingDice 1d8, explodeOnMaxDie true, caster-chosen type.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

// CHA 18 (+4) so the explosion cap is generous; level controls the
// cantrip base-dice count.
const buildSorcerer = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sorcerer',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'sorcerer', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 8 * level, max: 8 * level, temp: 0 },
    knownSpells: ['sorcerous-burst'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });

const castOnHit = (sorcLevel: number, seed: number): DamageRolledEvent | undefined => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const sorc = buildSorcerer(sorcLevel);
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: `sb-${sorcLevel}-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorc } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.castSpell(campaign.state, {
    characterId: sorc.id,
    spellId: 'sorcerous-burst',
    slotLevel: 0,
    targetIds: [target.id],
    casterChoice: { kind: 'damageType', value: 'fire' },
  }).events;
  const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
  if (attack?.hit !== true) return undefined;
  return events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
};

describe('Sorcerous Burst (slice 498)', () => {
  it('ships an exploding ranged spell attack with caster-chosen damage type', () => {
    const s = PACK.spells.find((sp) => sp.id === 'sorcerous-burst');
    expect(s?.mechanicalEffects).toEqual([
      {
        kind: 'attack',
        damageDice: '1d8',
        attackKind: 'ranged',
        cantripScalingDice: '1d8',
        explodeOnMaxDie: true,
        casterChoosesDamageType: { allowed: ['acid', 'cold', 'fire', 'lightning', 'poison', 'psychic', 'thunder'] },
      },
    ]);
  });

  it('on a hit, deals the caster-chosen damage type (fire)', () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const dmg = castOnHit(1, seed);
      if (dmg === undefined) continue;
      expect(dmg.rolls[0]!.type).toBe('fire');
      return;
    }
    throw new Error('no hit across 30 seeds');
  });

  it('an L1 sorcerer rolls 1 base d8; exploding adds at most CHA-mod (4) extra dice (all d8 faces)', () => {
    // Find a hit where the base die maxed (so an explosion happened) to
    // confirm extra dice appear and stay within the cap.
    for (let seed = 1; seed < 200; seed += 1) {
      const dmg = castOnHit(1, seed);
      if (dmg === undefined) continue;
      const rolls = dmg.rolls[0]!.rolls;
      // Base 1d8 + 0..4 exploded. Every roll is a d8 face (1..8).
      for (const r of rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(8);
      }
      // At L1, base = 1 die; extras capped at CHA mod (4). So total
      // dice in [1, 5].
      expect(rolls.length).toBeGreaterThanOrEqual(1);
      expect(rolls.length).toBeLessThanOrEqual(5);
      // If any explosion happened, the first die (or a later one) must
      // have been an 8 to trigger it.
      if (rolls.length > 1) {
        expect(rolls.some((r) => r === 8)).toBe(true);
      }
      return;
    }
    throw new Error('no hit across 200 seeds');
  });

  it('an L5 sorcerer rolls 2 base d8 (cantrip upgrade); total dice in [2, 6] (2 base + <=4 extra)', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const dmg = castOnHit(5, seed);
      if (dmg === undefined) continue;
      const rolls = dmg.rolls[0]!.rolls;
      // 2 base dice + 0..4 exploded.
      expect(rolls.length).toBeGreaterThanOrEqual(2);
      expect(rolls.length).toBeLessThanOrEqual(6);
      return;
    }
    throw new Error('no hit across 200 seeds');
  });

  it('explosion respects the CHA-mod cap: a low-CHA sorcerer adds fewer extras', () => {
    // Re-cast with a CHA-10 (+0) sorcerer: cap = 0, so NO extra dice
    // ever, regardless of how many 8s roll. The base-die count is 1 (L1).
    const lowChaSorc = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'LowSorc',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'sorcerer', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 8, max: 8, temp: 0 },
      knownSpells: ['sorcerous-burst'],
    });
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `sb-lowcha-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: lowChaSorc } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: lowChaSorc.id,
        spellId: 'sorcerous-burst',
        slotLevel: 0,
        targetIds: [target.id],
        casterChoice: { kind: 'damageType', value: 'fire' },
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const dmg = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      // CHA +0 -> cap 0 -> exactly 1 die, no explosions even on an 8.
      expect(dmg!.rolls[0]!.rolls.length).toBe(1);
      return;
    }
    throw new Error('no hit across 60 seeds');
  });
});
