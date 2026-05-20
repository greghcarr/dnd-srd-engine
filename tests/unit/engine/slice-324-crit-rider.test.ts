// Slice 324 — crit-gated onHit riders. A rider marked `requiresCritical`
// fires only on a critical hit. Canonical user: Sword of Life Stealing
// (a multi-base weapon enchantment) — on a crit vs a non-Construct/Undead
// target, +15 flat Necrotic (the 0d6+15 flat-damage shape; the gate and
// crit-trigger compose).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const ENCHANTMENT_ID = 'sword-of-life-stealing';

const enchanted = (): ItemInstance =>
  ItemInstanceSchema.parse({
    id: newItemInstanceId(),
    definitionId: 'longsword',
    enchantmentDefinitionId: ENCHANTMENT_ID,
  });

const buildFighter = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Reaper', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId, attuned: [weaponId] as never },
  });

const buildTarget = (statblockId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'sage',
    ...(statblockId !== undefined ? { kind: 'creature', statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 8,
  });

const statblockOfType = (type: string): string | undefined =>
  PACK.monsters.find((m) => (m as { type?: string }).type === type)?.id;

// Returns the DamageRolled of the first attack matching `wantCritical`,
// scanning seeds (each fresh campaign). undefined if none in budget.
const firstDamageRolled = (
  target: Character,
  wantCritical: boolean,
): DamageRolledEvent | undefined => {
  for (let seed = 1; seed < 200; seed += 1) {
    const weapon = enchanted();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const fighter = buildFighter(weapon.id);
    let campaign: Campaign = engine.createCampaign({ name: `crit-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, { attackerId: fighter.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit !== true || rolled.critical !== wantCritical) continue;
    return events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled');
  }
  return undefined;
};

describe('slice 324: Sword of Life Stealing crit-gated rider', () => {
  it('adds +15 flat necrotic on a critical hit vs a Humanoid', () => {
    const damage = firstDamageRolled(buildTarget(), true);
    expect(damage, 'expected a critical hit').toBeDefined();
    const necrotic = damage!.rolls.find((r) => r.type === 'necrotic');
    expect(necrotic, 'expected a necrotic crit rider').toBeDefined();
    // Flat 15: 0 dice rolled, modifier 15 (crit doubles dice, not the flat bonus).
    expect(necrotic!.rolls).toHaveLength(0);
    expect(necrotic!.modifier).toBe(15);
  });

  it('adds no necrotic on a normal (non-crit) hit', () => {
    const damage = firstDamageRolled(buildTarget(), false);
    expect(damage, 'expected a normal hit').toBeDefined();
    expect(damage!.rolls.some((r) => r.type === 'necrotic')).toBe(false);
  });

  it('does not fire on a crit against a Construct or Undead (gate)', () => {
    const constructId = statblockOfType('Construct');
    const undeadId = statblockOfType('Undead');
    for (const sb of [constructId, undeadId]) {
      if (sb === undefined) continue;
      const damage = firstDamageRolled(buildTarget(sb), true);
      expect(damage, 'expected a critical hit').toBeDefined();
      expect(damage!.rolls.some((r) => r.type === 'necrotic')).toBe(false);
    }
  });
});
