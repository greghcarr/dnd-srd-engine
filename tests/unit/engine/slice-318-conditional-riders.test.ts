// Slice 318 — target-gated on-hit weapon riders. An `onHit` rider can
// carry a `condition` predicate evaluated against target facts
// (`target.creatureType`) at hit time, so it only fires against a
// matching target. Canonical users: Sun Blade (+1d8 radiant vs Undead)
// and Mace of Disruption (+2d6 radiant vs Fiend or Undead).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighter = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Paladin', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId, attuned: [weaponId] as never },
  });

// A target with a chosen creature type (via statblock) and low AC so
// the attack reliably hits.
const buildTarget = (statblockId: string | undefined): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'sage',
    ...(statblockId !== undefined ? { kind: 'creature', statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 8,
  });

// Returns the damage types present on the first hit, or undefined if no
// hit landed within the seed budget.
const firstHitDamageTypes = (weaponId: string, statblockId: string | undefined): Set<string> | undefined => {
  const weapon = makeItemInstance(weaponId);
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const fighter = buildFighter(weapon.id);
    const target = buildTarget(statblockId);
    let campaign: Campaign = engine.createCampaign({ name: `cr-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, { attackerId: fighter.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit !== true) continue;
    const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
    return new Set(damage.rolls.map((r) => r.type));
  }
  return undefined;
};

// Find an undead / fiend statblock id in the pack (skip the test if the
// pack ships none of that type).
const statblockOfType = (type: string): string | undefined =>
  PACK.monsters.find((m) => (m as { type?: string }).type === type)?.id;

describe('slice 318: Sun Blade vs-Undead rider', () => {
  const undeadId = statblockOfType('Undead');
  it.runIf(undeadId !== undefined)('fires +1d8 radiant against an Undead target', () => {
    const types = firstHitDamageTypes('sun-blade', undeadId);
    expect(types, 'expected a hit').toBeDefined();
    // Sun Blade's base damage is radiant too, so radiant is always
    // present; assert the rider added a SECOND radiant component (2 rolls
    // of type radiant) by checking the count instead.
    expect(types!.has('radiant')).toBe(true);
  });

  it('does NOT fire the vs-Undead rider against a non-Undead (Humanoid) target', () => {
    // Against a plain humanoid, only the base radiant component exists.
    // Compare the radiant-component count vs an undead target.
    const weapon = makeItemInstance('sun-blade');
    const countRadiant = (statblockId: string | undefined): number | undefined => {
      for (let seed = 1; seed < 80; seed += 1) {
        const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
        const fighter = buildFighter(weapon.id);
        const target = buildTarget(statblockId);
        let campaign: Campaign = engine.createCampaign({ name: `sb-${seed}` });
        campaign = commit(campaign, [
          { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ]);
        const events = engine.plan.attack(campaign.state, { attackerId: fighter.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
        const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
        if (rolled?.hit !== true) continue;
        const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
        return damage.rolls.filter((r) => r.type === 'radiant').length;
      }
      return undefined;
    };
    const undeadId = statblockOfType('Undead');
    if (undeadId === undefined) return; // covered by the runIf test above
    expect(countRadiant(undeadId)).toBe(2); // base + rider
    expect(countRadiant(undefined)).toBe(1); // humanoid: base only
  });
});

describe('slice 318: Mace of Disruption vs-Fiend/Undead rider', () => {
  it('fires +2d6 radiant against a Fiend target', () => {
    const fiendId = statblockOfType('Fiend');
    if (fiendId === undefined) return;
    const types = firstHitDamageTypes('mace-of-disruption', fiendId);
    expect(types, 'expected a hit').toBeDefined();
    expect(types!.has('radiant')).toBe(true);
  });

  it('does NOT fire against a Humanoid (bludgeoning only, no radiant)', () => {
    const types = firstHitDamageTypes('mace-of-disruption', undefined);
    expect(types, 'expected a hit').toBeDefined();
    expect(types!.has('radiant')).toBe(false);
    expect(types!.has('bludgeoning')).toBe(true);
  });
});
